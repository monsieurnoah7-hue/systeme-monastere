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
  qty: z.coerce.number().int().min(1).default(1).optional(),
  outCondition: z.enum(['bon', 'passable', 'usure_normale']).optional().default('bon'),
});

const returnBody = z.object({
  condition: z.enum(['bon', 'lame_a_affuter', 'a_reparer', 'endommage', 'hors_service']),
  observations: z.string().optional(),
  magasinId: z.string().optional(),
  qty: z.coerce.number().int().min(1).optional(),
});

const updateLoanBody = z.object({
  qty: z.coerce.number().int().min(1).optional(),
  motive: z.string().min(1).optional(),
});

export const loansRoutes = new Hono();

loansRoutes.use('*', requireAuth);

loansRoutes.get('/', requirePerm('loans.view'), async (c) => {
  const status = c.req.query('status') ?? 'out';
  const db = getDb();
  const loans = await db.query(
    `SELECT l.*, 
            COALESCE(l.qty, 1)::int AS qty,
            COALESCE(l.returned_qty, 0)::int AS returned_qty,
            GREATEST(0, COALESCE(l.qty, 1) - COALESCE(l.returned_qty, 0))::int AS remaining_qty,
            t.name AS tool_name, t.category AS tool_category, e.full_name AS employee_name
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
  const requestedQty = body.data.qty ?? 1;

  const result = await db.transaction(async (tx) => {
    const tool = await tx.one<{
      id: string;
      status: string;
      total_qty: number;
      loaned_qty: number;
    }>(
      `SELECT t.id, t.status, COALESCE(t.total_qty, 1)::int AS total_qty,
              COALESCE(al.loaned_qty, 0)::int AS loaned_qty
         FROM tools t
         LEFT JOIN (
           SELECT tool_id, SUM(GREATEST(0, qty - COALESCE(returned_qty, 0)))::int AS loaned_qty
             FROM loans WHERE status = 'out' GROUP BY tool_id
         ) al ON al.tool_id = t.id
        WHERE t.id = $1 FOR UPDATE`,
      [body.data.toolId],
    );
    if (!tool) return { error: 'Outil introuvable.' } as const;
    const available = tool.total_qty - tool.loaned_qty;
    if (available < requestedQty) {
      return {
        error: `Stock insuffisant : ${available} disponible${available > 1 ? 's' : ''} (demandé : ${requestedQty}, total : ${tool.total_qty}).`,
      } as const;
    }
    const employee = await tx.one<{ id: string; active: boolean }>('SELECT id, active FROM employees WHERE id = $1', [
      body.data.employeeId,
    ]);
    if (!employee || !employee.active) return { error: 'Travailleur introuvable ou inactif.' } as const;

    const loan = await tx.one<{ id: number }>(
      `INSERT INTO loans (tool_id, employee_id, motive, out_condition, qty, returned_qty)
       VALUES ($1, $2, $3, $4, $5, 0) RETURNING id`,
      [tool.id, employee.id, body.data.motive.trim(), body.data.outCondition, requestedQty],
    );

    const remainingAvailable = available - requestedQty;
    const nextToolStatus = remainingAvailable <= 0 ? 'en_pret' : 'disponible';
    await tx.query('UPDATE tools SET status = $1 WHERE id = $2', [nextToolStatus, tool.id]);

    await tx.query(
      `INSERT INTO tool_events (tool_id, event_type, qty, from_status, to_status, actor, note)
       VALUES ($1, 'loan', $2, 'disponible', $3, $4, $5)`,
      [
        tool.id,
        requestedQty,
        nextToolStatus,
        actorName(c),
        `Prêt de ${requestedQty} unité(s) à ${employee.id} (État sortie: ${body.data.outCondition}) — ${body.data.motive.trim()}`,
      ],
    );
    await writeAudit(tx, {
      entity: 'loan',
      entityId: String(loan?.id ?? ''),
      action: 'loan',
      after: {
        toolId: tool.id,
        employeeId: employee.id,
        motive: body.data.motive,
        outCondition: body.data.outCondition,
        qty: requestedQty,
      },
      actorId: actorId(c),
      actorName: actorName(c),
    });
    return { loan } as const;
  });

  if ('error' in result) return c.json({ error: result.error }, 409);
  return c.json({ loan: result.loan }, 201);
});

loansRoutes.patch('/:id', requirePerm('loans.create'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'Identifiant invalide.' }, 400);
  const body = updateLoanBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Données de mise à jour invalides.' }, 400);
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    const loan = await tx.one<{
      id: number;
      tool_id: string;
      qty: number;
      returned_qty: number;
      status: string;
      motive: string;
    }>('SELECT * FROM loans WHERE id = $1 FOR UPDATE', [id]);
    if (!loan) return { error: 'Prêt introuvable.' } as const;
    if (loan.status !== 'out') return { error: 'Ce prêt n’est plus actif.' } as const;

    const newQty = body.data.qty !== undefined ? body.data.qty : loan.qty;
    const newMotive = body.data.motive !== undefined ? body.data.motive.trim() : loan.motive;

    if (newQty < (loan.returned_qty ?? 0)) {
      return { error: `La quantité prêtée ne peut pas être inférieure à la quantité déjà retournée (${loan.returned_qty}).` } as const;
    }

    if (newQty > loan.qty) {
      const tool = await tx.one<{ total_qty: number; loaned_qty: number }>(
        `SELECT COALESCE(t.total_qty, 1)::int AS total_qty,
                COALESCE(al.loaned_qty, 0)::int AS loaned_qty
           FROM tools t
           LEFT JOIN (
             SELECT tool_id, SUM(GREATEST(0, qty - COALESCE(returned_qty, 0)))::int AS loaned_qty
               FROM loans WHERE status = 'out' GROUP BY tool_id
           ) al ON al.tool_id = t.id
          WHERE t.id = $1`,
        [loan.tool_id],
      );
      const diff = newQty - loan.qty;
      const available = (tool?.total_qty ?? 1) - (tool?.loaned_qty ?? 0);
      if (available < diff) {
        return { error: `Stock insuffisant pour augmenter le prêt (${available} disponible(s)).` } as const;
      }
    }

    await tx.query('UPDATE loans SET qty = $1, motive = $2 WHERE id = $3', [newQty, newMotive, id]);

    await tx.query(
      `INSERT INTO tool_events (tool_id, event_type, qty, actor, note)
       VALUES ($1, 'loan_update', $2, $3, $4)`,
      [loan.tool_id, newQty, actorName(c), `Ajustement du prêt #${id} : quantité fixée à ${newQty}${newMotive ? ` — ${newMotive}` : ''}`],
    );

    await writeAudit(tx, {
      entity: 'loan',
      entityId: String(id),
      action: 'update_qty',
      before: { qty: loan.qty, motive: loan.motive },
      after: { qty: newQty, motive: newMotive },
      actorId: actorId(c),
      actorName: actorName(c),
    });

    return { ok: true, id, qty: newQty, motive: newMotive } as const;
  });

  if ('error' in result) return c.json({ error: result.error }, 400);
  return c.json(result);
});

loansRoutes.post('/:id/return', requirePerm('loans.return'), async (c) => {
  const body = returnBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'État au retour obligatoire.' }, 400);
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'Identifiant de prêt invalide.' }, 400);
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    const loan = await tx.one<{
      id: number;
      tool_id: string;
      status: string;
      qty: number;
      returned_qty: number;
    }>('SELECT * FROM loans WHERE id = $1 FOR UPDATE', [id]);
    if (!loan) return { error: 'Prêt introuvable.' } as const;
    if (loan.status !== 'out') return { error: 'Ce prêt est déjà clôturé.' } as const;

    const remaining = Math.max(1, (loan.qty ?? 1) - (loan.returned_qty ?? 0));
    const returnQty = body.data.qty !== undefined ? Math.min(body.data.qty, remaining) : remaining;
    const newReturnedTotal = (loan.returned_qty ?? 0) + returnQty;
    const isFullReturn = newReturnedTotal >= (loan.qty ?? 1);

    const isDefective = ['a_reparer', 'endommage', 'hors_service'].includes(body.data.condition);
    const nextStatus = isDefective ? 'maintenance' : 'disponible';
    const toolCondition = isDefective ? 'a_reparer' : 'bon';

    if (isFullReturn) {
      await tx.query(
        `UPDATE loans SET returned_at = now(), status = 'returned', returned_qty = $2, return_condition = $3, return_notes = $4 WHERE id = $1`,
        [id, newReturnedTotal, body.data.condition, body.data.observations?.trim() || null],
      );
    } else {
      await tx.query(
        `UPDATE loans SET returned_qty = $2, return_condition = $3, return_notes = $4 WHERE id = $1`,
        [id, newReturnedTotal, body.data.condition, body.data.observations?.trim() || null],
      );
    }

    // Calculer les prêts restants pour cet outil
    const activeRemaining = await tx.one<{ remaining_count: number }>(
      `SELECT COALESCE(SUM(GREATEST(0, qty - COALESCE(returned_qty, 0))), 0)::int AS remaining_count
         FROM loans WHERE tool_id = $1 AND status = 'out'`,
      [loan.tool_id],
    );

    const finalToolStatus = (activeRemaining?.remaining_count ?? 0) === 0 ? nextStatus : 'disponible';

    if (body.data.magasinId) {
      await tx.query('UPDATE tools SET status = $2, condition = $3, magasin_id = $4 WHERE id = $1', [
        loan.tool_id,
        finalToolStatus,
        toolCondition,
        body.data.magasinId,
      ]);
    } else {
      await tx.query('UPDATE tools SET status = $2, condition = $3 WHERE id = $1', [
        loan.tool_id,
        finalToolStatus,
        toolCondition,
      ]);
    }

    await tx.query(
      `INSERT INTO tool_events (tool_id, event_type, qty, from_status, to_status, actor, note)
       VALUES ($1, 'return', $2, 'en_pret', $3, $4, $5)`,
      [
        loan.tool_id,
        returnQty,
        finalToolStatus,
        actorName(c),
        `Retour de ${returnQty} unité(s) (Constat: ${body.data.condition})${body.data.observations ? ` — ${body.data.observations.trim()}` : ''}${!isFullReturn ? ` (Reste ${loan.qty - newReturnedTotal} en prêt)` : ''}`,
      ],
    );

    await writeAudit(tx, {
      entity: 'loan',
      entityId: String(id),
      action: 'return',
      before: { status: 'out', returned_qty: loan.returned_qty },
      after: {
        status: isFullReturn ? 'returned' : 'out',
        returned_qty: newReturnedTotal,
        qty_returned_this_time: returnQty,
        condition: body.data.condition,
        observations: body.data.observations,
        magasinId: body.data.magasinId,
      },
      actorId: actorId(c),
      actorName: actorName(c),
    });

    return { ok: true, returnQty, isFullReturn, remaining: loan.qty - newReturnedTotal } as const;
  });

  if ('error' in result) return c.json({ error: result.error }, 409);
  return c.json(result);
});
