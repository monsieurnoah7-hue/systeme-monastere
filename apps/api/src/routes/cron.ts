import { Hono } from 'hono';
import { env } from '../env.js';
import { runCloudBackup } from '../lib/backup.js';

export const cronRoutes = new Hono();

// Déclenché quotidiennement par Vercel Cron (vercel.json).
// Vercel envoie `Authorization: Bearer <CRON_SECRET>`.
cronRoutes.get('/backup', async (c) => {
  if (!env.cronSecret) return c.json({ ok: false, error: 'CRON_SECRET non configuré sur le serveur.' }, 500);
  const auth = c.req.header('authorization') ?? '';
  if (auth !== `Bearer ${env.cronSecret}`) return c.json({ ok: false, error: 'Non autorisé.' }, 401);

  try {
    const result = await runCloudBackup();
    return c.json({ ok: true, ...result });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
