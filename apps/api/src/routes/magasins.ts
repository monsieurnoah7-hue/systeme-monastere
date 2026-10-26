import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { writeAudit } from '../lib/audit.js';
import { actorId, actorName, requireAuth } from '../middleware/auth.js';
import { requirePerm } from '../middleware/permissions.js';

export type MagasinRow = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean;
  created_at: string;
  tools_count?: number;
  stock_count?: number;
};

const createBody = z.object({
  name: z.string().min(2),
  code: z.string().min(1).max(10),
  description: z.string().optional(),
});

const patchBody = z.object({
  name: z.string().min(2).optional(),
  code: z.string().min(1).max(10).optional(),
  description: z.string().optional(),
  active: z.boolean().optional(),
});

async function nextMagasinId(): Promise<string> {
  const row = await getDb().one<{ max_id: string | null }>(
    `SELECT max(id) AS max_id FROM magasins WHERE id ~ '^MAG-[0-9]+$'`,
  );
  const current = row?.max_id ? Number(row.max_id.split('-')[1] ?? 0) : 0;
  return `MAG-${String(current + 1).padStart(3, '0')}`;
}

export const magasinsRoutes = new Hono();

magasinsRoutes.use('*', requireAuth);

magasinsRoutes.get('/', requirePerm('magasins.view'), async (c) => {
  const magasins = await getDb().query<MagasinRow>(
    `SELECT m.*,
            (SELECT count(*)::int FROM tools t WHERE t.magasin_id = m.id) AS tools_count,
            (SELECT count(*)::int FROM stock_refs s WHERE s.magasin_id = m.id) AS stock_count
       FROM magasins m
      ORDER BY m.name`,
  );
  return c.json({ magasins });
});

magasinsRoutes.post('/', requirePerm('magasins.manage'), async (c) => {
  const body = createBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Nom et code obligatoires.' }, 400);
  const db = getDb();
  const code = body.data.code.trim().toUpperCase();
  const exists = await db.one('SELECT id FROM magasins WHERE code = $1', [code]);
  if (exists) return c.json({ error: 'Ce code magasin existe déjà.' }, 409);
  const id = await nextMagasinId();
  const magasin = await db.one<MagasinRow>(
    `INSERT INTO magasins (id, name, code, description) VALUES ($1, $2, $3, $4) RETURNING *`,
    [id, body.data.name.trim(), code, body.data.description?.trim() || null],
  );
  await writeAudit(db, {
    entity: 'magasin',
    entityId: id,
    action: 'create',
    after: magasin,
    actorId: actorId(c),
    actorName: actorName(c),
  });
  return c.json({ magasin }, 201);
});

magasinsRoutes.patch('/:id', requirePerm('magasins.manage'), async (c) => {
  const id = c.req.param('id') ?? '';
  const body = patchBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Données invalides.' }, 400);
  if (Object.keys(body.data).length === 0) return c.json({ error: 'Aucun champ à modifier.' }, 400);
  const db = getDb();
  const before = await db.one<MagasinRow>('SELECT * FROM magasins WHERE id = $1', [id]);
  if (!before) return c.json({ error: 'Magasin introuvable.' }, 404);
  const patch = body.data;
  if (patch.code && patch.code.trim().toUpperCase() !== before.code) {
    const dup = await db.one('SELECT id FROM magasins WHERE code = $1 AND id != $2', [patch.code.trim().toUpperCase(), id]);
    if (dup) return c.json({ error: 'Ce code magasin existe déjà.' }, 409);
  }
  const updated = await db.one<MagasinRow>(
    `UPDATE magasins SET name = $2, code = $3, description = $4, active = $5 WHERE id = $1 RETURNING *`,
    [
      id,
      patch.name?.trim() ?? before.name,
      patch.code?.trim().toUpperCase() ?? before.code,
      patch.description === undefined ? before.description : patch.description.trim() || null,
      patch.active ?? before.active,
    ],
  );
  await writeAudit(db, {
    entity: 'magasin',
    entityId: id,
    action: 'update',
    before,
    after: updated,
    actorId: actorId(c),
    actorName: actorName(c),
  });
  return c.json({ magasin: updated });
});

magasinsRoutes.delete('/:id', requirePerm('magasins.manage'), async (c) => {
  const id = c.req.param('id') ?? '';
  const body = await c.req.json().catch(() => ({}));
  const targetId = (body?.targetMagasinId || c.req.query('targetMagasinId'))?.trim() || null;

  const db = getDb();
  const before = await db.one<MagasinRow>('SELECT * FROM magasins WHERE id = $1', [id]);
  if (!before) return c.json({ error: 'Magasin introuvable.' }, 404);

  const usage = await db.one<{ tools: number; refs: number }>(
    `SELECT (SELECT count(*) FROM tools WHERE magasin_id = $1)::int AS tools,
            (SELECT count(*) FROM stock_refs WHERE magasin_id = $1)::int AS refs`,
    [id],
  );
  const toolsCount = Number(usage?.tools ?? 0);
  const refsCount = Number(usage?.refs ?? 0);

  if ((toolsCount > 0 || refsCount > 0) && !targetId) {
    return c.json(
      {
        error: `Ce magasin contient encore ${toolsCount} outil(s) et ${refsCount} référence(s) de stock.`,
        canTransfer: true,
        toolsCount,
        refsCount,
      },
      409,
    );
  }

  if (targetId) {
    if (targetId === id) {
      return c.json({ error: 'Le magasin de destination doit être distinct du magasin à supprimer.' }, 400);
    }
    const target = await db.one<MagasinRow>('SELECT * FROM magasins WHERE id = $1', [targetId]);
    if (!target) return c.json({ error: 'Magasin de destination introuvable.' }, 404);

    await db.transaction(async (tx) => {
      if (toolsCount > 0) {
        await tx.query('UPDATE tools SET magasin_id = $1, location = $2 WHERE magasin_id = $3', [
          targetId,
          target.name,
          id,
        ]);
      }
      if (refsCount > 0) {
        await tx.query('UPDATE stock_refs SET magasin_id = $1, location = $2 WHERE magasin_id = $3', [
          targetId,
          target.name,
          id,
        ]);
      }
      await tx.query('DELETE FROM magasins WHERE id = $1', [id]);
      await writeAudit(tx, {
        entity: 'magasin',
        entityId: id,
        action: 'delete_with_transfer',
        before,
        after: { transferredTo: targetId, targetName: target.name, toolsCount, refsCount },
        actorId: actorId(c),
        actorName: actorName(c),
      });
    });

    return c.json({
      ok: true,
      message: `Magasin supprimé avec succès. ${toolsCount} outil(s) et ${refsCount} stock(s) ont été transférés vers « ${target.name} ».`,
    });
  }

  await db.query('DELETE FROM magasins WHERE id = $1', [id]);
  await writeAudit(db, {
    entity: 'magasin',
    entityId: id,
    action: 'delete',
    before,
    actorId: actorId(c),
    actorName: actorName(c),
  });
  return c.json({ ok: true, message: `Magasin « ${before.name} » supprimé.` });
});

magasinsRoutes.get('/:id', requirePerm('magasins.view'), async (c) => {
  const id = c.req.param('id') ?? '';
  const db = getDb();
  const magasin = await db.one<MagasinRow>('SELECT * FROM magasins WHERE id = $1', [id]);
  if (!magasin) return c.json({ error: 'Magasin introuvable.' }, 404);
  const [tools, stock] = await Promise.all([
    db.query(
      `SELECT id, name, category, status, condition, status_reason FROM tools WHERE magasin_id = $1 ORDER BY name`,
      [id],
    ),
    db.query(
      `SELECT r.id, r.name, r.category, r.unit, r.min_qty,
              (r.initial_qty + COALESCE(m.qty, 0))::float AS qty
         FROM stock_refs r
         LEFT JOIN (
           SELECT ref_id,
                  sum(CASE WHEN move_type = 'in' THEN qty
                           WHEN move_type = 'out' THEN -qty
                           WHEN move_type = 'correction' THEN qty END) AS qty
             FROM stock_movements GROUP BY ref_id
         ) m ON m.ref_id = r.id
        WHERE r.magasin_id = $1
        ORDER BY r.name`,
      [id],
    ),
  ]);
  return c.json({ magasin, tools, stock });
});
