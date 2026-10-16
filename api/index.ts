import { handle } from 'hono/vercel';
import { Hono } from 'hono';
import { app as apiApp } from '../apps/api/src/app.js';
import { migrate } from '../apps/api/src/db/migrate.js';
import { ensureBootstrapAdmin } from '../apps/api/src/routes/auth.js';
import { getSelfie } from '../apps/api/src/lib/selfie-store.js';

// Wrappé pour gérer /files/* (selfies en base64 sur Vercel)
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

// Toutes les routes /api → Hono app
root.route('/', apiApp);

let ready = false;
async function ensureReady() {
  if (!ready) {
    await migrate();
    await ensureBootstrapAdmin();
    ready = true;
  }
}

const honoHandler = handle(root);

export default async function handler(req: Request, res: Response) {
  await ensureReady();
  return honoHandler(req, res);
}

export const runtime = 'nodejs';
export const maxDuration = 30;
