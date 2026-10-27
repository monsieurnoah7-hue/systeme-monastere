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
  brand: z.string().optional(),
  unit_cost: z.coerce.number().min(0).optional(),
  photo_path: z.string().nullable().optional(),
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
  brand: z.string().optional(),
  unit_cost: z.coerce.number().min(0).nullable().optional(),
  photo_path: z.string().nullable().optional(),
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

stockRoutes.get('/refs', requirePerm('stock.view'), async (c) => {
  const magasinId = c.req.query('magasin_id');
  const params: unknown[] = [];
  let magasinWhere = '';
  if (magasinId) {
    params.push(magasinId);
    magasinWhere = `WHERE r.magasin_id = $1`;
  }
  const refs = await getDb().query(
    `SELECT r.*, m.name AS magasin_name, m.code AS magasin_code,
            (
              r.initial_qty + COALESCE(
                (SELECT sum(CASE WHEN sm.move_type = 'in' THEN sm.qty
                                 WHEN sm.move_type = 'out' THEN -sm.qty
                                 WHEN sm.move_type = 'correction' THEN sm.qty END)
                   FROM stock_movements sm
                  WHERE sm.ref_id = r.id), 0
              )
            )::text AS qty
       FROM stock_refs r
       LEFT JOIN magasins m ON m.id = r.magasin_id
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

stockRoutes.get('/movements', requirePerm('stock.view'), async (c) => {
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
      `INSERT INTO stock_refs (name, category, unit, location, magasin_id, min_qty, supplier, brand, unit_cost, photo_path, initial_qty)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0) RETURNING *`,
      [
        data.name.trim(),
        data.category.trim(),
        data.unit.trim(),
        data.location.trim(),
        data.magasin_id || null,
        data.min_qty,
        data.supplier?.trim() || null,
        data.brand?.trim() || null,
        data.unit_cost ?? null,
        data.photo_path?.trim() || null,
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
    `UPDATE stock_refs SET
       name = coalesce($2, name),
       category = coalesce($3, category),
       unit = coalesce($4, unit),
       location = coalesce($5, location),
       magasin_id = CASE WHEN $6::text IS NOT NULL THEN (CASE WHEN $6 = '' THEN NULL ELSE $6 END) ELSE magasin_id END,
       min_qty = coalesce($7, min_qty),
       supplier = CASE WHEN $8::text IS NOT NULL THEN (CASE WHEN $8 = '' THEN NULL ELSE $8 END) ELSE supplier END,
       brand = CASE WHEN $9::text IS NOT NULL THEN (CASE WHEN $9 = '' THEN NULL ELSE $9 END) ELSE brand END,
       unit_cost = CASE WHEN $10::numeric IS NOT NULL THEN $10::numeric ELSE unit_cost END,
       photo_path = CASE WHEN $11::text IS NOT NULL THEN (CASE WHEN $11 = '' THEN NULL ELSE $11 END) ELSE photo_path END
     WHERE id = $1
     RETURNING *`,
    [
      id,
      patch.name?.trim() ?? null,
      patch.category?.trim() ?? null,
      patch.unit?.trim() ?? null,
      patch.location?.trim() ?? null,
      patch.magasin_id !== undefined ? patch.magasin_id : null,
      patch.min_qty !== undefined ? patch.min_qty : null,
      patch.supplier !== undefined ? patch.supplier.trim() : null,
      patch.brand !== undefined ? patch.brand.trim() : null,
      patch.unit_cost !== undefined ? patch.unit_cost : null,
      patch.photo_path !== undefined ? (patch.photo_path ? patch.photo_path.trim() : null) : null,
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

stockRoutes.post('/refs/:id/photo', requirePerm('stock.photo_edit'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: 'Référence invalide.' }, 400);
  const body = z.object({ photo_path: z.string().nullable() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Photo invalide.' }, 400);

  const db = getDb();
  const updated = await db.one<StockRefRow>(
    'UPDATE stock_refs SET photo_path = $2 WHERE id = $1 RETURNING *',
    [id, body.data.photo_path || null],
  );
  if (!updated) return c.json({ error: 'Référence introuvable.' }, 404);

  await writeAudit(db, {
    entity: 'stock_ref',
    entityId: String(id),
    action: 'photo_update',
    actorId: actorId(c),
    actorName: actorName(c),
    after: { photo_path: body.data.photo_path },
  });
  return c.json({ ok: true, ref: updated });
});

stockRoutes.post(
  '/movements',
  requirePerm('stock.move'),
  async (c) => {
    const body = movementBody.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: 'Mouvement invalide (type, quantité et référence requis).' }, 400);
    const data = body.data;
    const role = c.get('auth')?.user.role;
    if (data.move_type === 'correction' && role !== 'magasinier' && role !== 'direction') {
      return c.json({ error: 'Seul le magasinier ou la direction peut corriger le stock.' }, 403);
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

const importStockSchema = z.object({
  magasin_id: z.string().nullable().optional(),
  items: z.array(
    z.object({
      name: z.string().min(1),
      category: z.string().optional(),
      unit: z.string().optional(),
      location: z.string().optional(),
      magasin_id: z.string().nullable().optional(),
      min_qty: z.number().optional(),
      supplier: z.string().nullable().optional(),
      brand: z.string().nullable().optional(),
      unit_cost: z.number().nullable().optional(),
      qty: z.number().optional(),
    }),
  ),
});

stockRoutes.post('/import', requirePerm('stock.create_ref'), async (c) => {
  const body = importStockSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: 'Fichier tableur ou format des articles invalide.' }, 400);
  }

  const { items, magasin_id: defaultMagasinId } = body.data;
  if (!items.length) {
    return c.json({ error: 'Aucun article trouvé dans le fichier importé.' }, 400);
  }

  const db = getDb();
  let createdCount = 0;
  let updatedCount = 0;

  await db.transaction(async (tx) => {
    for (const item of items) {
      const targetMagasin = item.magasin_id || defaultMagasinId || null;
      const cleanName = item.name.trim();

      // Recherche anti-doublon intelligente (même nom insensible à la casse et même magasin)
      const existing = await tx.one<StockRefRow>(
        `SELECT * FROM stock_refs 
          WHERE lower(trim(name)) = lower(trim($1)) 
            AND (magasin_id = $2 OR (magasin_id IS NULL AND $2 IS NULL))`,
        [cleanName, targetMagasin],
      );

      if (existing) {
        // Mise à jour fidèle sans doublon
        await tx.query(
          `UPDATE stock_refs SET
             category = coalesce($2, category),
             unit = coalesce($3, unit),
             brand = coalesce($4, brand),
             unit_cost = coalesce($5, unit_cost),
             supplier = coalesce($6, supplier),
             location = coalesce($7, location)
           WHERE id = $1`,
          [
            existing.id,
            item.category?.trim() || null,
            item.unit?.trim() || null,
            item.brand?.trim() || null,
            item.unit_cost !== undefined ? item.unit_cost : null,
            item.supplier?.trim() || null,
            item.location?.trim() || null,
          ],
        );

        if (typeof item.qty === 'number' && item.qty >= 0) {
          const current = await refQty(Number(existing.id));
          const diff = item.qty - current;
          if (diff !== 0) {
            await tx.query(
              `INSERT INTO stock_movements (ref_id, move_type, qty, beneficiary, note, actor)
               VALUES ($1, 'correction', $2, 'Import Tableur', 'Ajustement inventaire tableur Excel', $3)`,
              [existing.id, Math.abs(diff), actorName(c)],
            );
          }
        }
        updatedCount += 1;
      } else {
        const initialQty = typeof item.qty === 'number' && item.qty >= 0 ? item.qty : 0;
        await tx.query(
          `INSERT INTO stock_refs (name, category, unit, location, magasin_id, min_qty, supplier, brand, unit_cost, initial_qty)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            cleanName,
            item.category?.trim() || 'Quincaillerie',
            item.unit?.trim() || 'u',
            item.location?.trim() || 'Dépôt Magasin',
            targetMagasin,
            item.min_qty ?? 5,
            item.supplier?.trim() || null,
            item.brand?.trim() || null,
            item.unit_cost ?? null,
            initialQty,
          ],
        );
        createdCount += 1;
      }
    }

    await writeAudit(tx, {
      entity: 'stock',
      entityId: 'spreadsheet_import',
      action: 'import',
      after: { createdCount, updatedCount, total: items.length },
      actorId: actorId(c),
      actorName: actorName(c),
    });
  });

  return c.json({
    ok: true,
    createdCount,
    updatedCount,
    totalProcessed: items.length,
    message: `${createdCount} article(s) créé(s), ${updatedCount} article(s) mis à jour sans doublon.`,
  });
});

/* =========================================================================
   DELETION & BATCH OPERATIONS (Google Enterprise Grade)
========================================================================= */

stockRoutes.delete('/refs/:id', requirePerm('stock.delete_ref'), async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'ID invalide.' }, 400);
  const db = getDb();
  const ref = await db.one<StockRefRow>('SELECT * FROM stock_refs WHERE id = $1', [id]);
  if (!ref) return c.json({ error: 'Article introuvable.' }, 404);

  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM stock_movements WHERE ref_id = $1', [id]);
    await tx.query('DELETE FROM stock_refs WHERE id = $1', [id]);
    await writeAudit(tx, {
      entity: 'stock_ref',
      entityId: String(id),
      action: 'delete',
      before: ref,
      actorId: actorId(c),
      actorName: actorName(c),
    });
  });

  return c.json({ ok: true, message: `Article #${id} (${ref.name}) supprimé définitivement.` });
});

const batchDeleteRefsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
});

stockRoutes.post('/refs/batch-delete', requirePerm('stock.delete_ref'), async (c) => {
  const body = batchDeleteRefsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Liste d’articles invalide.' }, 400);
  const { ids } = body.data;
  const db = getDb();

  let deletedCount = 0;
  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM stock_movements WHERE ref_id = ANY($1)', [ids]);
    const res = await tx.query('DELETE FROM stock_refs WHERE id = ANY($1) RETURNING id', [ids]);
    deletedCount = res.length;
    await writeAudit(tx, {
      entity: 'stock_refs',
      entityId: 'batch_delete',
      action: 'delete',
      before: { ids, count: deletedCount },
      actorId: actorId(c),
      actorName: actorName(c),
    });
  });

  return c.json({ ok: true, deletedCount, message: `${deletedCount} article(s) supprimé(s) définitivement.` });
});

const deleteAllRefsSchema = z.object({
  confirmation: z.literal('SUPPRIMER'),
  drafts_only: z.boolean().optional(),
  magasin_id: z.string().optional(),
});

stockRoutes.post('/refs/delete-all', requirePerm('stock.delete_ref'), async (c) => {
  const body = deleteAllRefsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Confirmation "SUPPRIMER" requise.' }, 400);

  const { drafts_only, magasin_id } = body.data;
  const db = getDb();

  let targetSql = 'SELECT id FROM stock_refs WHERE 1=1';
  const targetParams: unknown[] = [];
  if (drafts_only) {
    targetSql += ' AND (magasin_id IS NULL OR magasin_id = \'\')';
  } else if (magasin_id) {
    targetParams.push(magasin_id);
    targetSql += ' AND magasin_id = $1';
  }

  let deletedCount = 0;
  await db.transaction(async (tx) => {
    const rows = await tx.query<{ id: number }>(targetSql, targetParams);
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      await tx.query('DELETE FROM stock_movements WHERE ref_id = ANY($1)', [ids]);
      await tx.query('DELETE FROM stock_refs WHERE id = ANY($1)', [ids]);
      deletedCount = ids.length;
    }
    await writeAudit(tx, {
      entity: 'stock_refs',
      entityId: 'delete_all',
      action: 'delete',
      before: { drafts_only, magasin_id, count: deletedCount },
      actorId: actorId(c),
      actorName: actorName(c),
    });
  });

  return c.json({ ok: true, deletedCount, message: `${deletedCount} article(s) de stock supprimé(s).` });
});

const batchTransferRefsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
  magasin_id: z.string().nullable().optional(),
});

stockRoutes.post('/refs/batch-transfer', requirePerm('stock.edit_ref'), async (c) => {
  const body = batchTransferRefsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Données de transfert invalides.' }, 400);

  const { ids, magasin_id } = body.data;
  const db = getDb();
  const targetMagasin = magasin_id?.trim() || null;

  let magName = '📁 Brouillon / Non affecté';
  let magLocation = 'Quincaillerie';
  if (targetMagasin) {
    const mag = await db.one<{ name: string }>('SELECT name FROM magasins WHERE id = $1', [targetMagasin]);
    if (!mag) return c.json({ error: 'Magasin de destination introuvable.' }, 404);
    magName = mag.name;
    magLocation = mag.name;
  }

  await db.transaction(async (tx) => {
    await tx.query(
      `UPDATE stock_refs 
       SET magasin_id = $2,
           location = $3
       WHERE id = ANY($1)`,
      [ids, targetMagasin, magLocation],
    );

    await writeAudit(tx, {
      entity: 'stock_refs',
      entityId: 'batch_transfer',
      action: 'update',
      after: { ids, targetMagasin, magName },
      actorId: actorId(c),
      actorName: actorName(c),
    });
  });

  return c.json({
    ok: true,
    count: ids.length,
    message: `${ids.length} article(s) affecté(s) / transféré(s) avec succès vers ${magName}.`,
  });
});
