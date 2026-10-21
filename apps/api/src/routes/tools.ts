import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { writeAudit } from '../lib/audit.js';
import { actorId, actorName, requireAuth, requireRole } from '../middleware/auth.js';
import { requirePerm } from '../middleware/permissions.js';
import { TOOL_STATUSES, type ToolRow, type ToolStatus } from '../types.js';
import { Context } from 'hono';

const PREFIX: Record<string, string> = {
  Rabot: 'RBT',
  Scie: 'SCI',
  Perceuse: 'PER',
  Visseuse: 'VIS',
  Marteau: 'MAR',
  Meuleuse: 'MEU',
  Pince: 'PIN',
  Tournevis: 'TOU',
  Mesure: 'MET',
  Quincaillerie: 'QUI',
};

const listQuery = z.object({
  q: z.string().optional(),
  status: z.enum(TOOL_STATUSES).optional(),
  category: z.string().optional(),
  location: z.string().optional(),
  magasin_id: z.string().optional(),
});

const createBody = z.object({
  name: z.string().min(2),
  category: z.string().min(1).default('Divers'),
  location: z.string().min(1).default('Magasin'),
  magasin_id: z.string().optional(),
  observations: z.string().optional(),
});

const editBody = z.object({
  name: z.string().min(2).optional(),
  category: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  magasin_id: z.string().optional(),
  observations: z.string().optional(),
});

const statusBody = z.object({
  status: z.enum(TOOL_STATUSES),
  reason: z.string().min(2),
});

async function nextToolId(category: string): Promise<string> {
  const db = getDb();
  const prefix = PREFIX[category] ?? 'OUT';
  const row = await db.one<{ max_id: string | null }>(
    `SELECT max(id) AS max_id FROM tools WHERE id LIKE $1`,
    [`${prefix}-%`],
  );
  const current = row?.max_id ? Number(row.max_id.split('-')[1] ?? 0) : 0;
  return `${prefix}-${String(current + 1).padStart(3, '0')}`;
}

export const toolsRoutes = new Hono();

toolsRoutes.use('*', requireAuth);

toolsRoutes.get('/', requireRole('direction', 'magasinier', 'chef_atelier'), async (c) => {
  const parsed = listQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: 'Filtres invalides.' }, 400);
  const { q, status, category, location, magasin_id } = parsed.data;

  const where: string[] = [];
  const params: unknown[] = [];
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`(lower(t.id) LIKE $${params.length} OR lower(t.name) LIKE $${params.length} OR lower(t.category) LIKE $${params.length})`);
  }
  if (status) {
    params.push(status);
    where.push(`t.status = $${params.length}`);
  }
  if (category) {
    params.push(category);
    where.push(`t.category = $${params.length}`);
  }
  if (location) {
    params.push(location);
    where.push(`t.location = $${params.length}`);
  }
  if (magasin_id) {
    params.push(magasin_id);
    where.push(`t.magasin_id = $${params.length}`);
  }
  const sql = `SELECT t.*, m.name AS magasin_name, m.code AS magasin_code
                 FROM tools t LEFT JOIN magasins m ON m.id = t.magasin_id
                 ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY t.id`;
  const db = getDb();
  const [tools, cats, locs] = await Promise.all([
    db.query(sql, params),
    db.query<{ category: string }>('SELECT DISTINCT category FROM tools ORDER BY category'),
    db.query<{ location: string }>('SELECT DISTINCT location FROM tools ORDER BY location'),
  ]);
  return c.json({
    tools,
    facets: { categories: cats.map((r) => r.category), locations: locs.map((r) => r.location) },
  });
});

toolsRoutes.get('/:id', requireRole('direction', 'magasinier', 'chef_atelier'), async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const tool = await db.one(`SELECT t.*, m.name AS magasin_name, m.code AS magasin_code
    FROM tools t LEFT JOIN magasins m ON m.id = t.magasin_id WHERE t.id = $1`, [id]);
  if (!tool) return c.json({ error: 'Outil introuvable.' }, 404);
  const events = await db.query<{
    id: number;
    event_type: string;
    from_status: string | null;
    to_status: string | null;
    actor: string;
    note: string | null;
    created_at: string;
  }>('SELECT * FROM tool_events WHERE tool_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50', [id]);
  const loan = await db.one<{
    id: number;
    employee_id: string;
    full_name: string;
    out_at: string;
    due_at: string | null;
    motive: string | null;
  }>(
    `SELECT l.id, l.employee_id, e.full_name, l.out_at, l.due_at, l.motive
       FROM loans l JOIN employees e ON e.id = l.employee_id
      WHERE l.tool_id = $1 AND l.status = 'out'
      ORDER BY l.out_at DESC LIMIT 1`,
    [id],
  );
  return c.json({ tool, events, loan });
});

toolsRoutes.post('/', requirePerm('tools.create'), async (c) => {
  const body = createBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Nom et catégorie obligatoires.' }, 400);
  const db = getDb();
  const id = await nextToolId(body.data.category);
  const tool = await db.one<ToolRow>(
    `INSERT INTO tools (id, name, category, location, magasin_id, observations)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [id, body.data.name.trim(), body.data.category.trim(), body.data.location.trim(), body.data.magasin_id || null, body.data.observations?.trim() || null],
  );
  await db.query(
    `INSERT INTO tool_events (tool_id, event_type, from_status, to_status, actor, note)
     VALUES ($1, 'creation', NULL, 'disponible', $2, $3)`,
    [id, actorName(c), 'Création de la fiche outil'],
  );
  await writeAudit(db, {
    entity: 'tool',
    entityId: id,
    action: 'create',
    after: tool,
    actorId: actorId(c),
    actorName: actorName(c),
  });
  return c.json({ tool }, 201);
});

toolsRoutes.patch('/:id', requirePerm('tools.edit'), async (c) => {
  const id = c.req.param('id') ?? '';
  const body = editBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Données invalides.' }, 400);
  if (Object.keys(body.data).length === 0) return c.json({ error: 'Aucun champ à modifier.' }, 400);
  const db = getDb();
  const before = await db.one<ToolRow>('SELECT * FROM tools WHERE id = $1', [id]);
  if (!before) return c.json({ error: 'Outil introuvable.' }, 404);
  const p = body.data;
  const updated = await db.one<ToolRow>(
    `UPDATE tools SET name = $2, category = $3, location = $4, magasin_id = $5, observations = $6 WHERE id = $1 RETURNING *`,
    [
      id,
      p.name?.trim() ?? before.name,
      p.category?.trim() ?? before.category,
      p.location?.trim() ?? before.location,
      p.magasin_id === undefined ? before.magasin_id : p.magasin_id || null,
      p.observations === undefined ? before.observations : p.observations?.trim() || null,
    ],
  );
  await db.query(
    `INSERT INTO tool_events (tool_id, event_type, from_status, to_status, actor, note)
     VALUES ($1, 'correction', $2, $2, $3, $4)`,
    [id, before.status, actorName(c), p.magasin_id && p.magasin_id !== before.magasin_id ? 'Affectation de magasin modifiée' : 'Fiche outil modifiée'],
  );
  await writeAudit(db, {
    entity: 'tool',
    entityId: id,
    action: 'update',
    before,
    after: updated,
    actorId: actorId(c),
    actorName: actorName(c),
  });
  return c.json({ tool: updated });
});

toolsRoutes.patch('/:id/status', requirePerm('tools.edit_status'), async (c) => {
  const body = statusBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Statut et motif obligatoires.' }, 400);
  const db = getDb();
  const id = c.req.param('id') ?? '';
  const before = await db.one<ToolRow>('SELECT * FROM tools WHERE id = $1', [id]);
  if (!before) return c.json({ error: 'Outil introuvable.' }, 404);
  if (before.status === 'en_pret') {
    return c.json({ error: 'Outil en prêt : enregistrez d’abord le retour (PRE-03).' }, 409);
  }
  if (before.status === body.data.status && before.observations === body.data.reason) {
    return c.json({ error: 'Aucun changement à enregistrer.' }, 400);
  }
  const condition =
    body.data.status === 'maintenance' ? 'a_reparer' : body.data.status === 'reforme' ? 'hors_service' : before.condition;
  const statusReason = body.data.status === 'disponible' ? null : body.data.reason.trim();
  const updated = await db.one<ToolRow>(
    'UPDATE tools SET status = $2, condition = $3, status_reason = $4 WHERE id = $1 RETURNING *',
    [id, body.data.status, condition, statusReason],
  );
  await db.query(
    `INSERT INTO tool_events (tool_id, event_type, from_status, to_status, actor, note)
     VALUES ($1, 'status', $2, $3, $4, $5)`,
    [id, before.status, body.data.status, actorName(c), body.data.reason.trim()],
  );
  await writeAudit(db, {
    entity: 'tool',
    entityId: id,
    action: 'status_change',
    before: { status: before.status, condition: before.condition },
    after: { status: updated?.status, condition: updated?.condition, reason: body.data.reason },
    actorId: actorId(c),
    actorName: actorName(c),
    reason: body.data.reason.trim(),
  });
  return c.json({ tool: updated });
});

export async function logToolEvent(c: Context, toolId: string, type: string, from: ToolStatus | null, to: ToolStatus, note: string) {
  await getDb().query(
    `INSERT INTO tool_events (tool_id, event_type, from_status, to_status, actor, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [toolId, type, from, to, actorName(c), note],
  );
}
