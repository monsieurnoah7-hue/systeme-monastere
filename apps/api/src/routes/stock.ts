import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { writeAudit } from '../lib/audit.js';
import { actorId, actorName, requireAuth, requireRole } from '../middleware/auth.js';
import { requirePerm } from '../middleware/permissions.js';

export const stockRoutes = new Hono();

stockRoutes.use('*', requireAuth);

const refBody = z.object({
  name: z.string().min(2),
  category: z.string().min(1).default('Divers'),
  unit: z.string().min(1).default('u'),
  location: z.string().min(1).default('Quincaillerie'),
  magasin_id: z.string().optional(),
  min_qty: z.number().min(0).default(0),
  supplier: z.string().optional(),
  initial_qty: z.number().min(0).default(0),
});

const patchRefBody = z.object({
  name: z.string().min(2).optional(),
  category: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  magasin_id: z.string().optional(),
  min_qty: z.number().min(0).optional(),
  supplier: z.string().optional(),
});

const movementBody = z.object({
  ref_id: z.coerce.number().int().positive(),
  move_type: z.enum(['in', 'out', 'correction']),
  qty: z.number().refine((v) => v !== 0, 'Quantité non nulle attendue.'),
  beneficiary: z.string().optional(),
  doc_ref: z.string().optional(),
  note: z.string().optional(),
});

type StockRefRow = {
  id: number;
  name: string;
  category: string;
  unit: string;
  location: string;
  min_qty: string;
  supplier: string | null;
  initial_qty: string;
};

async function refQty(refId: number): Promise<number> {
  const row = await getDb().one<{ qty: string }>(
    `SELECT (r.initial_qty + COALESCE(m.qty, 0))::text AS qty
       FROM stock_refs r
       LEFT JOIN (
         SELECT ref_id,
                sum(CASE WHEN move_type IN ('in', 'correction') THEN qty ELSE -qty END) AS qty
           FROM stock_movements
          GROUP BY ref_id
       ) m ON m.ref_id = r.id
      WHERE r.id = $1`,
    [refId],
  );
  return Number(row?.qty ?? 0);
}

stockRoutes.get('/refs', requireRole('direction', 'magasinier', 'chef_atelier', 'admin'), async (c) => {
  const magasinId = c.req.query('magasin_id');
  const params: unknown[] = [];
  let magasinWhere = '';
  if (magasinId) {
    params.push(magasinId);
    magasinWhere = `WHERE r.magasin_id = $1`;
  }
  const refs = await getDb().query(
    `SELECT r.*, m.name AS magasin_name, m.code AS magasin_code,
            (r.initial_qty + COALESCE(mv.qty, 0))::text AS qty
       FROM stock_refs r
       LEFT JOIN magasins m ON m.id = r.magasin_id
       LEFT JOIN (
         SELECT ref_id,
                sum(CASE WHEN move_type = 'in' THEN qty
                         WHEN move_type = 'out' THEN -qty
                         WHEN move_type = 'correction' THEN qty END) AS qty
           FROM stock_movements
          GROUP BY ref_id
       ) mv ON mv.ref_id = r.id
       ${magasinWhere}
      ORDER BY r.name`,
    params,
  );
  return c.json({
    refs: (refs as any[]).map((r) => ({
      ...r,
      min_qty: Number(r.min_qty),
      initial_qty: Number(r.initial_qty),
      qty: Number(r.qty),
    })),
  });
});

stockRoutes.get('/movements', requireRole('direction', 'magasinier', 'chef_atelier', 'admin'), async (c) => {
  const refId = c.req.query('refId');
  const moveType = c.req.query('move_type');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const q = c.req.query('q');
  const params: unknown[] = [];
  const where: string[] = [];
  if (refId) { params.push(Number(refId)); where.push(`m.ref_id = $${params.length}`); }
  if (moveType) { params.push(moveType); where.push(`m.move_type = $${params.length}`); }
  if (from) { params.push(from); where.push(`m.created_at::date >= $${params.length}`); }
  if (to) { params.push(to); where.push(`m.created_at::date <= $${params.length}`); }
  if (q) { params.push(`%${q.toLowerCase()}%`); where.push(`(lower(r.name) LIKE $${params.length} OR lower(coalesce(m.beneficiary,'')) LIKE $${params.length} OR lower(coalesce(m.actor,'')) LIKE $${params.length})`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const movements = await getDb().query(
    `SELECT m.*, r.name AS ref_name, r.unit
       FROM stock_movements m
       JOIN stock_refs r ON r.id = m.ref_id
       ${whereSql}
      ORDER BY m.created_at DESC
      LIMIT 200`,
    params,
  );
  return c.json({ movements });
});

stockRoutes.post('/refs', requirePerm('stock.create_ref'), async (c) => {
  const body = refBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Donts de référence incomplets.' }, 400);
  const db = getDb();
  const data = body.data;

  const created = await db.transaction(async (tx) => {
    const ref = await tx.one<StockRefRow>(
      `INSERT INTO stock_refs (name, category, unit, location, magasin_id, min_qty, supplier, initial_qty)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0) RETURNING *`,
      [
        data.name.trim(),
        data.category.trim(),
        data.unit.trim(),
        data.location.trim(),
        data.magasin_id || null,
        data.min_qty,
        data.supplier?.trim() || null,
      ],
    );
    if (!ref) throw new Error('création référence impossible');
    if (data.initial_qty > 0) {
      await tx.query(
        `INSERT INTO stock_movements (ref_id, move_type, qty, beneficiary, note, actor)
         VALUES ($1, 'in', $2, 'Stock initial', $3, $4)`,
        [ref.id, data.initial_qty, `Stock initial de création`, actorName(c)],
      );
    }
    return ref;
  });

  await writeAudit(db, {
    entity: 'stock_ref',
    entityId: String(created.id),
    action: 'create',
    after: { ...created, initial_qty: data.initial_qty },
    actorId: actorId(c),
    actorName: actorName(c),
  });
  return c.json(
    {
      ref: {
        ...created,
        min_qty: data.min_qty,
        initial_qty: data.initial_qty,
        qty: data.initial_qty,
      },
    },
    201,
  );
});

stockRoutes.patch('/refs/:id', requirePerm('stock.edit_ref'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: 'Référence invalide.' }, 400);
  const body = patchRefBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Données de référence invalides.' }, 400);
  if (Object.keys(body.data).length === 0) return c.json({ error: 'Aucun champ à modifier.' }, 400);

  const db = getDb();
  const before = await db.one<StockRefRow>('SELECT * FROM stock_refs WHERE id = $1', [id]);
  if (!before) return c.json({ error: 'Référence introuvable.' }, 404);

  const patch = body.data;
  const updated = await db.one<StockRefRow>(
    `UPDATE stock_refs SET name = $2, category = $3, unit = $4, location = $5, magasin_id = $6, min_qty = $7, supplier = $8
      WHERE id = $1 RETURNING *`,
    [
      id,
      patch.name?.trim() ?? before.name,
      patch.category?.trim() ?? before.category,
      patch.unit?.trim() ?? before.unit,
      patch.location?.trim() ?? before.location,
      patch.magasin_id === undefined ? (before as any).magasin_id : patch.magasin_id || null,
      patch.min_qty ?? Number(before.min_qty),
      patch.supplier === undefined ? before.supplier : patch.supplier.trim() || null,
    ],
  );
  await writeAudit(db, {
    entity: 'stock_ref',
    entityId: String(id),
    action: 'update',
    before,
    after: updated,
    actorId: actorId(c),
    actorName: actorName(c),
  });
  return c.json({
    ref: updated
      ? { ...updated, min_qty: Number(updated.min_qty), initial_qty: Number(updated.initial_qty) }
      : updated,
  });
});

stockRoutes.post(
  '/movements',
  requirePerm('stock.move'),
  async (c) => {
    const body = movementBody.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: 'Mouvement invalide (type, quantité et référence requis).' }, 400);
    const data = body.data;
    const role = c.get('auth')?.user.role;
    if (data.move_type === 'correction' && role !== 'magasinier' && role !== 'admin') {
      return c.json({ error: 'Seul le magasinier ou l’administrateur peut corriger le stock.' }, 403);
    }
    if (data.move_type !== 'out' && role === 'chef_atelier') {
      return c.json({ error: 'Le chef d’atelier ne peut enregistrer qu’une sortie de matériel.' }, 403);
    }
    if (data.move_type === 'correction' && !data.note?.trim()) {
      return c.json({ error: 'Le motif est obligatoire pour une correction (CDC stock).' }, 400);
    }
    if (data.move_type === 'out' && !data.beneficiary?.trim()) {
      return c.json({ error: 'Le bénéficiaire est obligatoire pour une sortie.' }, 400);
    }

    const db = getDb();
    const ref = await db.one<StockRefRow>('SELECT * FROM stock_refs WHERE id = $1', [data.ref_id]);
    if (!ref) return c.json({ error: 'Référence introuvable.' }, 404);

    const current = await refQty(data.ref_id);
    const next = data.move_type === 'out' ? current - data.qty : current + data.qty;
    if (next < 0) {
      return c.json(
        { error: `Stock insuffisant : ${current} ${ref.unit} disponibles, ${data.qty} ${ref.unit} demandés.` },
        409,
      );
    }

    const movement = await db.one(
      `INSERT INTO stock_movements (ref_id, move_type, qty, beneficiary, doc_ref, note, actor)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        data.ref_id,
        data.move_type,
        data.qty,
        data.beneficiary?.trim() || null,
        data.doc_ref?.trim() || null,
        data.note?.trim() || null,
        actorName(c),
      ],
    );
    await writeAudit(db, {
      entity: 'stock_movement',
      entityId: String(movement?.id ?? ''),
      action: data.move_type,
      after: { ref_id: data.ref_id, qty: data.qty, next, beneficiary: data.beneficiary, note: data.note },
      actorId: actorId(c),
      actorName: actorName(c),
      reason: data.note?.trim() || null,
    });
    return c.json({ movement, qty: next }, 201);
  },
);
