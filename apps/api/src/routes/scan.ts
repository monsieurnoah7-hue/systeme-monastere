import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const scanRoutes = new Hono();

scanRoutes.use('*', requireAuth);

const query = z.object({ q: z.string().min(1) });

function stripPrefix(raw: string, prefix: string): string | null {
  const lower = raw.toLowerCase();
  if (lower.startsWith(prefix)) return raw.slice(prefix.length).trim() || null;
  return null;
}

scanRoutes.get('/', requireRole('direction', 'magasinier', 'chef_atelier'), async (c) => {
  const parsed = query.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: 'Code requis.' }, 400);
  const rawCode = parsed.data.q.trim();
  const upper = rawCode.toUpperCase();

  let toolId = stripPrefix(rawCode, 'montfebe:tool:');
  let badgeToken = stripPrefix(rawCode, 'montfebe:badge:');
  let stockId = stripPrefix(rawCode, 'montfebe:stock:');
  if (stripPrefix(rawCode, 'montfebe:punch:')) {
    return c.json({ kind: 'ignored', reason: 'QR de pointage : utilisez la borne.' });
  }
  if (!toolId && !badgeToken && !stockId && upper.startsWith('MONTFEBE')) {
    return c.json({ kind: 'unknown', code: rawCode });
  }

  const db = getDb();

  if (toolId) {
    const tool = await db.one(
      `SELECT t.*, l.employee_id AS loan_employee_id, e.full_name AS loan_employee_name, l.id AS loan_id, l.motive AS loan_motive, l.out_at AS loan_out_at
         FROM tools t
         LEFT JOIN loans l ON l.tool_id = t.id AND l.status = 'out'
         LEFT JOIN employees e ON e.id = l.employee_id
        WHERE t.id = $1`,
      [toolId],
    );
    if (tool) return c.json({ kind: 'tool', tool, code: rawCode });
  }

  if (badgeToken) {
    const employee = await db.one(
      `SELECT id, full_name, job_title, photo_path, active FROM employees WHERE badge_token = $1`,
      [badgeToken],
    );
    if (employee) return c.json({ kind: 'employee', employee, code: rawCode, via: 'badge' });
  }

  if (stockId && /^\d+$/.test(stockId)) {
    const ref = await db.one(
      `SELECT r.*, (r.initial_qty + COALESCE(m.qty, 0))::text AS qty
         FROM stock_refs r
         LEFT JOIN (
           SELECT ref_id, sum(CASE WHEN move_type = 'in' THEN qty WHEN move_type = 'out' THEN -qty WHEN move_type = 'correction' THEN qty END) AS qty
             FROM stock_movements GROUP BY ref_id
         ) m ON m.ref_id = r.id
        WHERE r.id = $1`,
      [Number(stockId)],
    );
    if (ref) return c.json({ kind: 'stock', ref: { ...ref, qty: Number(ref.qty) }, code: rawCode });
  }

  // raw id fallbacks
  const tool = await db.one(
    `SELECT t.*, l.employee_id AS loan_employee_id, e.full_name AS loan_employee_name, l.id AS loan_id
       FROM tools t
       LEFT JOIN loans l ON l.tool_id = t.id AND l.status = 'out'
       LEFT JOIN employees e ON e.id = l.employee_id
      WHERE t.id = $1`,
    [upper],
  );
  if (tool) return c.json({ kind: 'tool', tool, code: rawCode });

  const employee = await db.one(
    `SELECT id, full_name, job_title, photo_path, active FROM employees WHERE id = $1 OR badge_token = $1`,
    [upper],
  );
  if (employee) return c.json({ kind: 'employee', employee, code: rawCode, via: 'id' });

  const terminal = await db.one(`SELECT id, name FROM terminals WHERE id = $1 AND active = true`, [upper]);
  if (terminal) return c.json({ kind: 'terminal', terminal, code: rawCode });

  return c.json({ kind: 'unknown', code: rawCode });
});
