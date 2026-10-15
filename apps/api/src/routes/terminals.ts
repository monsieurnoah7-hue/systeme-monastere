import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { writeAudit } from '../lib/audit.js';
import { actorId, actorName, requireAuth, requireRole } from '../middleware/auth.js';
import { requirePerm } from '../middleware/permissions.js';

export const terminalsRoutes = new Hono();

terminalsRoutes.use('*', requireAuth);

const createBody = z.object({
  name: z.string().min(3),
  id: z.string().regex(/^TERM-[A-Z0-9]{4,10}$/).optional(),
});

const patchBody = z.object({
  name: z.string().min(3).optional(),
  active: z.boolean().optional(),
});

type TerminalRow = {
  id: string;
  name: string;
  active: boolean;
  registered_at: string;
};

terminalsRoutes.get('/', requirePerm('terminals.manage'), async (c) => {
  const terminals = await getDb().query<TerminalRow & { last_used: string | null; punches_today: string }>(
    `SELECT t.id, t.name, t.active, t.registered_at,
            max(a.server_at)::text AS last_used,
            count(*) FILTER (WHERE a.punch_date = CURRENT_DATE)::text AS punches_today
       FROM terminals t
       LEFT JOIN attendance a ON a.terminal_id = t.id
      GROUP BY t.id, t.name, t.active, t.registered_at
      ORDER BY t.name`,
  );
  return c.json({
    terminals: terminals.map((t) => ({ ...t, punches_today: Number(t.punches_today) })),
  });
});

terminalsRoutes.post('/', requirePerm('terminals.manage'), async (c) => {
  const body = createBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Nom du terminal requis (ex. « Tablette de l’atelier »).' }, 400);
  const db = getDb();

  let id = body.data.id;
  if (id) {
    const existing = await db.one('SELECT id FROM terminals WHERE id = $1', [id]);
    if (existing) return c.json({ error: `L’identifiant ${id} est déjà utilisé.` }, 409);
  } else {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `TERM-${randomBytes(2).toString('hex').toUpperCase()}`;
      const existing = await db.one('SELECT id FROM terminals WHERE id = $1', [candidate]);
      if (!existing) {
        id = candidate;
        break;
      }
    }
    if (!id) return c.json({ error: 'Impossible de générer un identifiant, précisez-le (TERM-XXXX).' }, 500);
  }

  const terminal = await db.one<TerminalRow>(
    'INSERT INTO terminals (id, name) VALUES ($1, $2) RETURNING *',
    [id, body.data.name.trim()],
  );
  await writeAudit(db, {
    entity: 'terminal',
    entityId: id,
    action: 'create',
    after: terminal,
    actorId: actorId(c),
    actorName: actorName(c),
  });
  return c.json({ terminal }, 201);
});

terminalsRoutes.patch('/:id', requirePerm('terminals.manage'), async (c) => {
  const id = c.req.param('id') ?? '';
  const body = patchBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Données invalides.' }, 400);
  if (Object.keys(body.data).length === 0) return c.json({ error: 'Aucun champ à modifier.' }, 400);

  const db = getDb();
  const before = await db.one<TerminalRow>('SELECT * FROM terminals WHERE id = $1', [id]);
  if (!before) return c.json({ error: 'Terminal introuvable.' }, 404);

  const updated = await db.one<TerminalRow>(
    'UPDATE terminals SET name = $2, active = $3 WHERE id = $1 RETURNING *',
    [id, body.data.name?.trim() ?? before.name, body.data.active ?? before.active],
  );
  await writeAudit(db, {
    entity: 'terminal',
    entityId: id,
    action: body.data.active === false ? 'deactivate' : 'update',
    before,
    after: updated,
    actorId: actorId(c),
    actorName: actorName(c),
  });
  return c.json({ terminal: updated });
});
