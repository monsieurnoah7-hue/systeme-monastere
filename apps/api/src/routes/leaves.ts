import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { writeAudit } from '../lib/audit.js';
import { actorId, actorName, requireAuth } from '../middleware/auth.js';
import { requirePerm } from '../middleware/permissions.js';

const LEAVE_KINDS = ['conge', 'permission', 'absence'] as const;
const LEAVE_STATUS = ['pending', 'approved', 'rejected'] as const;

const listQuery = z.object({
  employee_id: z.string().optional(),
  status: z.enum(LEAVE_STATUS).optional(),
  kind: z.enum(LEAVE_KINDS).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const createBody = z.object({
  employee_id: z.string().min(1),
  kind: z.enum(LEAVE_KINDS),
  from_date: z.string().min(1),
  to_date: z.string().min(1),
  note: z.string().optional(),
});

const reviewBody = z.object({
  status: z.enum(['approved', 'rejected']),
  review_note: z.string().optional(),
});

export type LeaveRow = {
  id: number;
  employee_id: string;
  full_name?: string;
  job_title?: string;
  kind: string;
  from_date: string;
  to_date: string;
  note: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  actor: string;
  created_at: string;
};

export const leavesRoutes = new Hono();

leavesRoutes.use('*', requireAuth);

leavesRoutes.get('/', requirePerm('leaves.view'), async (c) => {
  const parsed = listQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: 'Filtres invalides.' }, 400);
  const { employee_id, status, kind, from, to } = parsed.data;
  const where: string[] = [];
  const params: unknown[] = [];
  if (employee_id) { params.push(employee_id); where.push(`ab.employee_id = $${params.length}`); }
  if (status) { params.push(status); where.push(`ab.status = $${params.length}`); }
  if (kind) { params.push(kind); where.push(`ab.kind = $${params.length}`); }
  if (from) { params.push(from); where.push(`ab.to_date >= $${params.length}`); }
  if (to) { params.push(to); where.push(`ab.from_date <= $${params.length}`); }
  const sql = `SELECT ab.*, e.full_name, e.job_title
                 FROM absences ab
                 JOIN employees e ON e.id = ab.employee_id
                 ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                ORDER BY ab.created_at DESC
                LIMIT 200`;
  const leaves = await getDb().query<LeaveRow>(sql, params);
  return c.json({ leaves });
});

leavesRoutes.get('/mine', requireAuth, async (c) => {
  const auth = c.get('auth');
  const employeeId = auth?.user?.employee_id;
  if (!employeeId) return c.json({ leaves: [] });
  const leaves = await getDb().query<LeaveRow>(
    `SELECT * FROM absences WHERE employee_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [employeeId],
  );
  return c.json({ leaves });
});

leavesRoutes.post('/', requirePerm('leaves.manage'), async (c) => {
  const body = createBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Données de congé invalides.' }, 400);
  const db = getDb();
  const emp = await db.one('SELECT id FROM employees WHERE id = $1', [body.data.employee_id]);
  if (!emp) return c.json({ error: 'Travailleur introuvable.' }, 404);
  const leave = await db.one<LeaveRow>(
    `INSERT INTO absences (employee_id, kind, from_date, to_date, note, actor, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
    [
      body.data.employee_id,
      body.data.kind,
      body.data.from_date,
      body.data.to_date,
      body.data.note?.trim() || null,
      actorName(c),
    ],
  );
  await writeAudit(db, {
    entity: 'absence',
    entityId: String(leave?.id ?? ''),
    action: 'create',
    after: leave,
    actorId: actorId(c),
    actorName: actorName(c),
  });
  return c.json({ leave }, 201);
});

leavesRoutes.patch('/:id/review', requirePerm('leaves.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: 'Demande invalide.' }, 400);
  const body = reviewBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Statut invalide.' }, 400);
  const db = getDb();
  const before = await db.one<LeaveRow>('SELECT * FROM absences WHERE id = $1', [id]);
  if (!before) return c.json({ error: 'Demande introuvable.' }, 404);
  if (before.status !== 'pending') return c.json({ error: 'Cette demande a déjà été traitée.' }, 409);
  const updated = await db.one<LeaveRow>(
    `UPDATE absences SET status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4
      WHERE id = $1 RETURNING *`,
    [id, body.data.status, actorName(c), body.data.review_note?.trim() || null],
  );
  await writeAudit(db, {
    entity: 'absence',
    entityId: String(id),
    action: body.data.status === 'approved' ? 'approve' : 'reject',
    before,
    after: updated,
    actorId: actorId(c),
    actorName: actorName(c),
    reason: body.data.review_note?.trim() || null,
  });
  return c.json({ leave: updated });
});

leavesRoutes.delete('/:id', requirePerm('leaves.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: 'Demande invalide.' }, 400);
  const db = getDb();
  const before = await db.one<LeaveRow>('SELECT * FROM absences WHERE id = $1', [id]);
  if (!before) return c.json({ error: 'Demande introuvable.' }, 404);
  if (before.status === 'approved') return c.json({ error: 'Impossible de supprimer une demande approuvée.' }, 409);
  await db.query('DELETE FROM absences WHERE id = $1', [id]);
  await writeAudit(db, {
    entity: 'absence',
    entityId: String(id),
    action: 'delete',
    before,
    actorId: actorId(c),
    actorName: actorName(c),
  });
  return c.json({ ok: true });
});
