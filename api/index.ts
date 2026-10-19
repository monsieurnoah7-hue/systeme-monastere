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

async function handler(req: Request): Promise<Response> {
  try {
    await ensureReady();
  } catch (err) {
    console.error('[api] échec initialisation', err);
    return Response.json({ error: "Initialisation de la base impossible, réessayez dans un instant." }, { status: 503 });
  }

  // Sur Vercel, req.url est un chemin relatif (/api/health?__p=health).
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost';
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const url = new URL(req.url, `${proto}://${host}`);
  const p = url.searchParams.get('__p');
  const f = url.searchParams.get('__f');
  if (p !== null) {
    url.pathname = `/api/${p}`;
    url.searchParams.delete('__p');
    url.searchParams.delete('__f');
  } else if (f !== null) {
    url.pathname = `/files/${f}`;
    url.searchParams.delete('__p');
    url.searchParams.delete('__f');
  }
  return root.fetch(new Request(url, req));
}

export default handler;

export const runtime = 'nodejs';
export const maxDuration = 30;
