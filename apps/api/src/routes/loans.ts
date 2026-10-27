import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { writeAudit } from '../lib/audit.js';
import { actorId, actorName, requireAuth, requireRole } from '../middleware/auth.js';
import { requirePerm } from '../middleware/permissions.js';

const createBody = z.object({
  toolId: z.string().min(1),
  employeeId: z.string().min(1),
  motive: z.string().min(2),
  outCondition: z.enum(['bon', 'passable', 'usure_normale']).optional().default('bon'),
});

const returnBody = z.object({
  condition: z.enum(['bon', 'lame_a_affuter', 'a_reparer', 'endommage', 'hors_service']),
  observations: z.string().optional(),
  magasinId: z.string().optional(),
});

export const loansRoutes = new Hono();

loansRoutes.use('*', requireAuth);

loansRoutes.get('/', requirePerm('loans.view'), async (c) => {
  const status = c.req.query('status') ?? 'out';
  const db = getDb();
  const loans = await db.query(
    `SELECT l.*, t.name AS tool_name, t.category AS tool_category, e.full_name AS employee_name
       FROM loans l
       JOIN tools t ON t.id = l.tool_id
       JOIN employees e ON e.id = l.employee_id
      WHERE l.status = $1
      ORDER BY l.out_at DESC
      LIMIT 200`,
    [status],
  );
  return c.json({ loans });
});

loansRoutes.post('/', requirePerm('loans.create'), async (c) => {
  const body = createBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Outil, travailleur et motif obligatoires.' }, 400);
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    const tool = await tx.one<{ id: string; status: string }>('SELECT id, status FROM tools WHERE id = $1 FOR UPDATE', [
      body.data.toolId,
    ]);
    if (!tool) return { error: 'Outil introuvable.' } as const;
    if (tool.status !== 'disponible') {
      return { error: 'Cet outil n’est pas disponible (PRE-02).' } as const;
    }
    const employee = await tx.one<{ id: string; active: boolean }>('SELECT id, active FROM employees WHERE id = $1', [
      body.data.employeeId,
    ]);
    if (!employee || !employee.active) return { error: 'Travailleur introuvable ou inactif.' } as const;

    const loan = await tx.one<{ id: number }>(
      `INSERT INTO loans (tool_id, employee_id, motive, out_condition) VALUES ($1, $2, $3, $4) RETURNING id`,
      [tool.id, employee.id, body.data.motive.trim(), body.data.outCondition],
    );
    await tx.query(`UPDATE tools SET status = 'en_pret' WHERE id = $1`, [tool.id]);
    await tx.query(
      `INSERT INTO tool_events (tool_id, event_type, from_status, to_status, actor, note)
       VALUES ($1, 'loan', 'disponible', 'en_pret', $2, $3)`,
      [tool.id, actorName(c), `Prêt à ${employee.id} (État sortie: ${body.data.outCondition}) — ${body.data.motive.trim()}`],
    );
    await writeAudit(tx, {
      entity: 'loan',
      entityId: String(loan?.id ?? ''),
      action: 'loan',
      after: { toolId: tool.id, employeeId: employee.id, motive: body.data.motive, outCondition: body.data.outCondition },
      actorId: actorId(c),
      actorName: actorName(c),
    });
    return { loan } as const;
  });

  if ('error' in result) return c.json({ error: result.error }, 409);
  return c.json({ loan: result.loan }, 201);
});

loansRoutes.post('/:id/return', requirePerm('loans.return'), async (c) => {
  const body = returnBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'État au retour obligatoire.' }, 400);
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'Identifiant de prêt invalide.' }, 400);
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    const loan = await tx.one<{ id: number; tool_id: string; status: string }>('SELECT * FROM loans WHERE id = $1 FOR UPDATE', [id]);
    if (!loan) return { error: 'Prêt introuvable.' } as const;
    if (loan.status !== 'out') return { error: 'Ce prêt est déjà clôturé.' } as const;

    const isDefective = ['a_reparer', 'endommage', 'hors_service'].includes(body.data.condition);
    const nextStatus = isDefective ? 'maintenance' : 'disponible';
    const toolCondition = isDefective ? 'a_reparer' : 'bon';

    await tx.query(
      `UPDATE loans SET returned_at = now(), status = 'returned', return_condition = $2, return_notes = $3 WHERE id = $1`,
      [id, body.data.condition, body.data.observations?.trim() || null],
    );

    if (body.data.magasinId) {
      await tx.query('UPDATE tools SET status = $2, condition = $3, magasin_id = $4 WHERE id = $1', [
        loan.tool_id,
        nextStatus,
        toolCondition,
        body.data.magasinId,
      ]);
    } else {
      await tx.query('UPDATE tools SET status = $2, condition = $3 WHERE id = $1', [
        loan.tool_id,
        nextStatus,
        toolCondition,
      ]);
    }

    await tx.query(
      `INSERT INTO tool_events (tool_id, event_type, from_status, to_status, actor, note)
       VALUES ($1, 'return', 'en_pret', $2, $3, $4)`,
      [
        loan.tool_id,
        nextStatus,
        actorName(c),
        body.data.observations?.trim() || `Retour constat: ${body.data.condition}`,
      ],
    );
    await writeAudit(tx, {
      entity: 'loan',
      entityId: String(id),
      action: 'return',
      before: { status: 'out' },
      after: { status: 'returned', condition: body.data.condition, observations: body.data.observations, magasinId: body.data.magasinId },
      actorId: actorId(c),
      actorName: actorName(c),
    });
    return { ok: true } as const;
  });

  if ('error' in result) return c.json({ error: result.error }, 409);
  return c.json({ ok: true });
});
