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

  const url = new URL(req.url);
  const p = url.searchParams.get('__p');
  const f = url.searchParams.get('__f');
  if (p !== null || f !== null) {
    const target = new URL(url);
    target.pathname = p !== null ? `/api/${p}` : `/files/${f}`;
    target.searchParams.delete('__p');
    target.searchParams.delete('__f');
    req = new Request(target, req);
  }
  return root.fetch(req);
}

export default handler;

export const runtime = 'nodejs';
export const maxDuration = 30;
