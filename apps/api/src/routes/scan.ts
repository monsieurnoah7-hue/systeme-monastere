import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { hasPermission, requirePerm } from '../middleware/permissions.js';
import { canAccessStore } from '../lib/store-access.js';

export const scanRoutes = new Hono();

scanRoutes.use('*', requireAuth);

const query = z.object({ q: z.string().min(1) });

function stripPrefix(raw: string, prefix: string): string | null {
  const lower = raw.toLowerCase();
  if (lower.startsWith(prefix)) return raw.slice(prefix.length).trim() || null;
  return null;
}

scanRoutes.get('/', requirePerm('scanner.use'), async (c) => {
  const parsed = query.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: 'Code requis.' }, 400);
  const rawCode = parsed.data.q.trim();
  const upper = rawCode.toUpperCase();
  const role = c.get('auth')?.user.role;
  const userId = c.get('auth')?.user.id;
  const canRead = async (permission: 'tools.view' | 'stock.view' | 'employees.view' | 'terminals.manage') =>
    Boolean(role && await hasPermission(role, permission));
  const forbidden = () => c.json({ error: 'Votre droit de scan ne couvre pas la consultation de cet élément.' }, 403);

  let toolId = stripPrefix(rawCode, 'montfebe:tool:');
  let badgeToken = stripPrefix(rawCode, 'montfebe:badge:');
  let stockId = stripPrefix(rawCode, 'montfebe:stock:');
  let kitId = stripPrefix(rawCode, 'montfebe:kit:');
  const kitItemCode = stripPrefix(rawCode, 'montfebe:kit-item:') ?? stripPrefix(rawCode, 'cftm:tool:');
  if (stripPrefix(rawCode, 'montfebe:punch:')) {
    return c.json({ kind: 'ignored', reason: 'QR de pointage : utilisez la borne.' });
  }
  if (!toolId && !badgeToken && !stockId && !kitId && !kitItemCode && upper.startsWith('MONTFEBE')) {
    return c.json({ kind: 'unknown', code: rawCode });
  }

  const db = getDb();

  if (kitId) {
    if (!await canRead('employees.view')) return forbidden();
    const kit = await db.one(`
      SELECT k.*, e.full_name AS employee_name, e.job_title AS employee_job, e.photo_path AS employee_photo,
             m.name AS source_magasin_name
        FROM etabli_kits k
        JOIN employees e ON e.id = k.employee_id
        JOIN magasins m ON m.id = k.source_magasin_id
       WHERE (k.id = $1 OR k.code = $1)
         AND EXISTS (SELECT 1 FROM etabli_kit_items i WHERE i.kit_id = k.id)
    `, [kitId.toUpperCase()]);
    if (kit && userId && await canAccessStore(userId, kit.source_magasin_id, 'can_scan')) {
      const items = await db.query(`SELECT * FROM etabli_kit_items WHERE kit_id = $1 ORDER BY item_num ASC`, [kit.id]);
      return c.json({ kind: 'etabli_kit', kit, items, code: rawCode });
    }
  }

  if (toolId) {
    if (!await canRead('tools.view')) return forbidden();
    const tool = await db.one(
      `SELECT t.*,
              COALESCE(t.total_qty, 1)::int AS total_qty,
              COALESCE(al.loaned_qty, 0)::int AS loaned_qty,
              GREATEST(0, COALESCE(t.total_qty, 1) - COALESCE(al.loaned_qty, 0))::int AS available_qty,
              l.employee_id AS loan_employee_id, e.full_name AS loan_employee_name, l.id AS loan_id, l.motive AS loan_motive, l.out_at AS loan_out_at,
              COALESCE(l.qty, 1)::int AS loan_qty
         FROM tools t
         LEFT JOIN (
           SELECT tool_id, SUM(GREATEST(0, qty - COALESCE(returned_qty, 0)))::int AS loaned_qty
             FROM loans WHERE status = 'out' GROUP BY tool_id
         ) al ON al.tool_id = t.id
         LEFT JOIN loans l ON l.tool_id = t.id AND l.status = 'out'
         LEFT JOIN employees e ON e.id = l.employee_id
        WHERE t.id = $1`,
      [toolId],
    );
    if (tool && userId && await canAccessStore(userId, tool.magasin_id, 'can_scan')) return c.json({ kind: 'tool', tool, code: rawCode });
  }

  if (badgeToken) {
    if (!await canRead('employees.view')) return forbidden();
    const employee = await db.one(
      `SELECT id, full_name, job_title, photo_path, active FROM employees WHERE badge_token = $1`,
      [badgeToken],
    );
    if (employee) return c.json({ kind: 'employee', employee, code: rawCode, via: 'badge' });
  }

  if (stockId && /^\d+$/.test(stockId)) {
    if (!await canRead('stock.view')) return forbidden();
    const ref = await db.one(
      `SELECT r.*, (r.initial_qty + COALESCE(m.qty, 0))::text AS qty
         FROM stock_refs r
         LEFT JOIN (
           SELECT ref_id, sum(CASE WHEN move_type = 'in' THEN qty WHEN move_type IN ('out', 'transfer') THEN -qty WHEN move_type = 'correction' THEN qty END) AS qty
             FROM stock_movements GROUP BY ref_id
         ) m ON m.ref_id = r.id
        WHERE r.id = $1`,
      [Number(stockId)],
    );
    if (ref && userId && await canAccessStore(userId, ref.magasin_id, 'can_scan')) return c.json({ kind: 'stock', ref: { ...ref, qty: Number(ref.qty) }, code: rawCode });
  }

  // raw id fallbacks
  const tool = await db.one(
    `SELECT t.*,
            COALESCE(t.total_qty, 1)::int AS total_qty,
            COALESCE(al.loaned_qty, 0)::int AS loaned_qty,
            GREATEST(0, COALESCE(t.total_qty, 1) - COALESCE(al.loaned_qty, 0))::int AS available_qty,
            l.employee_id AS loan_employee_id, e.full_name AS loan_employee_name, l.id AS loan_id,
            COALESCE(l.qty, 1)::int AS loan_qty
       FROM tools t
       LEFT JOIN (
         SELECT tool_id, SUM(GREATEST(0, qty - COALESCE(returned_qty, 0)))::int AS loaned_qty
           FROM loans WHERE status = 'out' GROUP BY tool_id
       ) al ON al.tool_id = t.id
       LEFT JOIN loans l ON l.tool_id = t.id AND l.status = 'out'
       LEFT JOIN employees e ON e.id = l.employee_id
      WHERE t.id = $1`,
    [upper],
  );
  if (tool && userId && await canAccessStore(userId, tool.magasin_id, 'can_scan')) {
    if (!await canRead('tools.view')) return forbidden();
    return c.json({ kind: 'tool', tool, code: rawCode });
  }

  const employee = await db.one(
    `SELECT id, full_name, job_title, photo_path, active FROM employees WHERE id = $1 OR badge_token = $1`,
    [upper],
  );
  if (employee) {
    if (!await canRead('employees.view')) return forbidden();
    return c.json({ kind: 'employee', employee, code: rawCode, via: 'id' });
  }

  const terminal = await db.one(`SELECT id, name FROM terminals WHERE id = $1 AND active = true`, [upper]);
  if (terminal) {
    if (!await canRead('terminals.manage')) return forbidden();
    return c.json({ kind: 'terminal', terminal, code: rawCode });
  }

  // Direct kit match by id or code
  const directKit = await db.one(`
    SELECT k.*, e.full_name AS employee_name, e.job_title AS employee_job, e.photo_path AS employee_photo,
           m.name AS source_magasin_name
      FROM etabli_kits k
      JOIN employees e ON e.id = k.employee_id
      JOIN magasins m ON m.id = k.source_magasin_id
     WHERE (k.id = $1 OR k.code = $1)
       AND EXISTS (SELECT 1 FROM etabli_kit_items i WHERE i.kit_id = k.id)
  `, [upper]);
  if (directKit && userId && await canAccessStore(userId, directKit.source_magasin_id, 'can_scan')) {
    if (!await canRead('employees.view')) return forbidden();
    const items = await db.query(`SELECT * FROM etabli_kit_items WHERE kit_id = $1 ORDER BY item_num ASC`, [directKit.id]);
    return c.json({ kind: 'etabli_kit', kit: directKit, items, code: rawCode });
  }

  // Direct kit item match by tool_code
  const kitItem = await db.one(`
    SELECT i.*, k.code AS kit_code, k.etabli_number, k.location AS etabli_location, k.source_magasin_id
      FROM etabli_kit_items i
      JOIN etabli_kits k ON k.id = i.kit_id
     WHERE i.tool_code = $1
  `, [kitItemCode ?? upper]);
  if (kitItem && userId && await canAccessStore(userId, kitItem.source_magasin_id, 'can_scan')) {
    if (!await canRead('tools.view')) return forbidden();
    return c.json({ kind: 'etabli_kit_item', item: kitItem, code: rawCode });
  }

  return c.json({ kind: 'unknown', code: rawCode });
});
