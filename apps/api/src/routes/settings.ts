import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { writeAudit } from '../lib/audit.js';
import { DEFAULT_SETTINGS, loadSettings, saveSetting } from '../lib/settings.js';
import { parseHm } from '../lib/time.js';
import { actorId, actorName, requireAuth, requireRole } from '../middleware/auth.js';
import { requirePerm } from '../middleware/permissions.js';

export const settingsRoutes = new Hono();

settingsRoutes.use('*', requireAuth);

const hm = z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM attendu.');

const putBody = z.object({
  opening_time: hm.optional(),
  closing_time: hm.optional(),
  tolerance_minutes: z.number().int().min(0).max(180).optional(),
  workdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  late_motifs: z.array(z.string().min(2)).min(1).max(12).optional(),
  selfie_retention_days: z.number().int().min(7).max(3650).optional(),
  card_display_seconds: z.number().int().min(3).max(60).optional(),
});

settingsRoutes.get('/', requirePerm('settings.view'), async (c) => {
  return c.json({ settings: await loadSettings(), defaults: DEFAULT_SETTINGS });
});

settingsRoutes.put('/', requirePerm('settings.edit'), async (c) => {
  const body = putBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Paramètres invalides.' }, 400);
  const patch = body.data;
  if (Object.keys(patch).length === 0) return c.json({ error: 'Aucun paramètre à modifier.' }, 400);

  const before = await loadSettings();
  const opening = patch.opening_time ?? before.opening_time;
  const closing = patch.closing_time ?? before.closing_time;
  if (parseHm(closing) <= parseHm(opening)) {
    return c.json({ error: 'L’heure de fermeture doit être postérieure à l’heure d’ouverture.' }, 400);
  }

  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) await saveSetting(key, value);
  }
  const after = await loadSettings();
  await writeAudit(getDb(), {
    entity: 'settings',
    entityId: 'global',
    action: 'update',
    before,
    after: patch,
    actorId: actorId(c),
    actorName: actorName(c),
  });
  return c.json({ settings: after });
});
