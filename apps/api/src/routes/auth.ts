import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { env } from '../env.js';
import { getDb } from '../db/index.js';
import { hashPassword, randomToken, sha256, verifyPassword } from '../lib/crypto.js';
import { requireAuth, SESSION_COOKIE } from '../middleware/auth.js';
import type { UserRow } from '../types.js';

const loginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

export const authRoutes = new Hono();

authRoutes.post('/login', async (c) => {
  const body = loginSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Identifiant et mot de passe requis.' }, 400);

  const db = getDb();
  const user = await db.one<{ id: number; password_hash: string; active: boolean }>(
    'SELECT id, password_hash, active FROM users WHERE login = $1',
    [body.data.login.trim().toLowerCase()],
  );
  if (!user || !user.active || !verifyPassword(body.data.password, user.password_hash)) {
    return c.json({ error: 'Identifiant ou mot de passe incorrect.' }, 401);
  }

  const token = randomToken();
  const ttl = new Date(Date.now() + env.sessionTtlHours * 3600 * 1000);
  await db.query('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)', [sha256(token), user.id, ttl.toISOString()]);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: env.isProd,
    expires: ttl,
  });

  const state = await db.one<{ id: number; login: string; display_name: string; role: UserRow['role']; employee_id: string | null }>(
    'SELECT id, login, display_name, role, employee_id FROM users WHERE id = $1',
    [user.id],
  );
  return c.json({ user: state ?? null });
});

authRoutes.post('/logout', async (c) => {
  const raw = getCookie(c, SESSION_COOKIE);
  if (raw) await getDb().query('DELETE FROM sessions WHERE id = $1', [sha256(raw)]);
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

authRoutes.get('/me', requireAuth, async (c) => {
  return c.json({ user: c.get('auth').user });
});

export async function ensureBootstrapAdmin(): Promise<void> {
  const db = getDb();
  const row = await db.one<{ count: string }>('SELECT count(*)::text AS count FROM users');
  if (Number(row?.count ?? 0) > 0) return;
  const hash = hashPassword(env.bootstrapPassword);
  await db.query(
    `INSERT INTO users (login, password_hash, display_name, role)
     VALUES ('admin', $1, 'Administrateur', 'admin')`,
    [hash],
  );
  console.log('[auth] compte admin initial créé (login: admin)');
}
