import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { getImage, saveImage } from '../lib/image-store.js';
import { requireAuth } from '../middleware/auth.js';

export const imagesRoutes = new Hono();

// GET image (public / avec cache navigateur 24h)
imagesRoutes.get('/:name', async (c) => {
  const name = c.req.param('name');
  if (!/^[A-Za-z0-9_\-.]+\.(jpg|jpeg|png|webp)$/i.test(name)) {
    return c.notFound();
  }
  const file = await getImage(name);
  if (!file) return c.notFound();

  return c.body(new Uint8Array(file.data), 200, {
    'Content-Type': file.contentType,
    'Cache-Control': 'public, max-age=86400, immutable',
  });
});

const uploadSchema = z.object({
  dataUrl: z.string().min(10),
  prefix: z.string().max(40).optional(),
});

// POST upload image (authentifié)
imagesRoutes.post('/upload', requireAuth, async (c) => {
  const body = uploadSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: 'Image invalide ou absente.' }, 400);
  }

  const prefix = body.data.prefix || 'img';
  const url = await saveImage(prefix, body.data.dataUrl);

  return c.json({ ok: true, url });
});

// GET gallery of existing item photos for grouping / reuse
imagesRoutes.get('/gallery/tools', requireAuth, async (c) => {
  const db = getDb();
  const rows = await db.query<{ photo_path: string; name: string; category: string }>(
    `SELECT DISTINCT ON (photo_path) photo_path, name, category
       FROM tools
      WHERE photo_path IS NOT NULL AND length(photo_path) > 3
      ORDER BY photo_path, created_at DESC
      LIMIT 60`,
  );
  return c.json({ photos: rows });
});

imagesRoutes.get('/gallery/stock', requireAuth, async (c) => {
  const db = getDb();
  const rows = await db.query<{ photo_path: string; name: string; category: string }>(
    `SELECT DISTINCT ON (photo_path) photo_path, name, category
       FROM stock_refs
      WHERE photo_path IS NOT NULL AND length(photo_path) > 3
      ORDER BY photo_path, created_at DESC
      LIMIT 60`,
  );
  return c.json({ photos: rows });
});
