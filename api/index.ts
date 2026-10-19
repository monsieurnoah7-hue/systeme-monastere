import { Hono } from 'hono';
import { app as apiApp } from '../apps/api/src/app.js';
import { migrate } from '../apps/api/src/db/migrate.js';
import { ensureBootstrapAdmin } from '../apps/api/src/routes/auth.js';
import { getSelfie } from '../apps/api/src/lib/selfie-store.js';

// Les rewrites Vercel convertissent le chemin :
//   /api/stock?x=1  → /api/index?__p=stock&x=1
//   /files/selfies/a.jpg → /api/index?__f=selfies/a.jpg
// On reconstruit l'URL d'origine avant de servir l'app Hono.
const root = new Hono();

root.get('/files/selfies/:name', async (c) => {
  const name = c.req.param('name');
  if (!/^[A-Za-z0-9_\-]+\.jpg$/.test(name)) return c.notFound();
  const file = await getSelfie(name);
  if (!file) return c.notFound();
  return c.body(new Uint8Array(file.data), 200, {
    'Content-Type': file.contentType,
    'Cache-Control': 'private, max-age=86400',
  });
});

root.route('/', apiApp);

root.notFound((c) => c.json({ error: 'Route introuvable.' }, 404));

let readyPromise: Promise<void> | null = null;
function ensureReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = migrate()
      .then(() => ensureBootstrapAdmin())
      .catch((err) => {
        readyPromise = null;
        throw err;
      });
  }
  return readyPromise;
}

type NodeHeaders = Record<string, string | string[] | undefined>;

interface NodeLikeRequest {
  url?: string;
  method?: string;
  headers: NodeHeaders;
  body?: unknown;
  on(event: string, listener: (...args: any[]) => void): void;
}

interface NodeLikeResponse {
  statusCode: number;
  setHeader(name: string, value: string | string[]): void;
  end(chunk?: Uint8Array): void;
}

function isWebRequest(req: unknown): req is Request {
  const r = req as Request | undefined;
  return !!r && typeof r.url === 'string' && typeof (r.headers as Headers | undefined)?.get === 'function';
}

function toWebHeaders(headers: NodeHeaders): Headers {
  const out = new Headers();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) out.append(key, item);
    } else {
      out.set(key, value);
    }
  }
  return out;
}

function readNodeBody(req: NodeLikeRequest): Promise<Uint8Array | undefined> {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return Promise.resolve(undefined);
  if (typeof req.body === 'string') return Promise.resolve(new TextEncoder().encode(req.body));
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(new TextEncoder().encode(JSON.stringify(req.body)));
  }
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    req.on('data', (chunk: Uint8Array | string) => {
      chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk));
    });
    req.on('end', () => {
      let total = 0;
      for (const chunk of chunks) total += chunk.length;
      const out = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
      }
      resolve(out);
    });
    req.on('error', reject);
  });
}

function absoluteUrl(rawUrl: string, headers: { get(name: string): string | null }): URL {
  if (/^https?:\/\//i.test(rawUrl)) return new URL(rawUrl);
  const host = headers.get('x-forwarded-host') ?? headers.get('host') ?? 'localhost';
  const proto = headers.get('x-forwarded-proto') ?? 'https';
  return new URL(rawUrl, `${proto}://${host}`);
}

async function nodeToWebRequest(req: NodeLikeRequest): Promise<Request> {
  const hostHeader = req.headers['x-forwarded-host'] ?? req.headers['host'] ?? 'localhost';
  const host = Array.isArray(hostHeader) ? (hostHeader[0] ?? 'localhost') : (hostHeader ?? 'localhost');
  const protoHeader = req.headers['x-forwarded-proto'] ?? 'https';
  const proto = Array.isArray(protoHeader) ? (protoHeader[0] ?? 'https') : (protoHeader ?? 'https');
  const url = new URL(req.url ?? '/', `${proto}://${host}`);
  const body = await readNodeBody(req);
  return new Request(url, {
    method: (req.method ?? 'GET').toUpperCase(),
    headers: toWebHeaders(req.headers),
    body: body as any,
  });
}

function withRewrittenPath(request: Request): Request {
  const url = absoluteUrl(request.url, request.headers);
  const p = url.searchParams.get('__p');
  const f = url.searchParams.get('__f');
  if (p !== null) {
    url.pathname = `/api/${p}`;
    url.searchParams.delete('__p');
    url.searchParams.delete('__f');
    return new Request(url, request);
  }
  if (f !== null) {
    url.pathname = `/files/${f}`;
    url.searchParams.delete('__p');
    url.searchParams.delete('__f');
    return new Request(url, request);
  }
  return request.url === url.href ? request : new Request(url, request);
}

async function processRequest(request: Request): Promise<Response> {
  try {
    await ensureReady();
  } catch (err) {
    console.error('[api] échec initialisation', err);
    return Response.json(
      { error: 'Initialisation de la base impossible, réessayez dans un instant.' },
      { status: 503 },
    );
  }
  return root.fetch(request);
}

async function writeNodeResponse(response: Response, res: NodeLikeResponse): Promise<void> {
  res.statusCode = response.status;
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const cookies = typeof getSetCookie === 'function' ? getSetCookie.call(response.headers) : [];
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return;
    res.setHeader(key, value);
  });
  if (cookies.length > 0) res.setHeader('set-cookie', cookies);
  res.end(new Uint8Array(await response.arrayBuffer()));
}

// Vercel (runtime Node) appelle (req, res) avec des objets type http.IncomingMessage/ServerResponse.
// Les tests locaux et le format Web passent un vrai Request et reçoivent un Response.
export default async function handler(
  req: Request | NodeLikeRequest,
  res?: NodeLikeResponse,
): Promise<Response | undefined> {
  const request = isWebRequest(req) ? req : await nodeToWebRequest(req as NodeLikeRequest);
  const response = await processRequest(withRewrittenPath(request));
  if (res) {
    await writeNodeResponse(response, res);
    return undefined;
  }
  return response;
}

export const runtime = 'nodejs';
export const maxDuration = 30;
