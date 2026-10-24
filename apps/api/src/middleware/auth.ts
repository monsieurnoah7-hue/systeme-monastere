import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { getDb } from '../db/index.js';
import { sha256 } from '../lib/crypto.js';
import type { Role, UserRow } from '../types.js';

export const SESSION_COOKIE = 'mf_session';

export type AuthState = {
  user: UserRow;
  sessionId: string;
};

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthState;
  }
}

export async function loadSession(c: Context): Promise<AuthState | null> {
  const raw = getCookie(c, SESSION_COOKIE);
  if (!raw) return null;
  const db = getDb();
  const row = await db.one<{ id: string; user_id: number; expires_at: string; photo_path: string | null; emp_photo: string | null } & UserRow>(
    `SELECT s.id, s.user_id, s.expires_at, u.id AS u_id, u.login, u.display_name, u.role, u.employee_id, u.photo_path, e.photo_path AS emp_photo
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN employees e ON e.id = u.employee_id
      WHERE s.id = $1 AND u.active = true`,
    [sha256(raw)],
  );
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.query('DELETE FROM sessions WHERE id = $1', [row.id]);
    return null;
  }
  return {
    sessionId: row.id,
    user: {
      id: Number(row.user_id),
      login: row.login,
      display_name: row.display_name,
      role: row.role,
      employee_id: row.employee_id,
      photo_path: row.photo_path || row.emp_photo || null,
    },
  };
}

export const requireAuth = async (c: Context, next: Next) => {
  const state = await loadSession(c);
  if (!state) return c.json({ error: 'Authentification requise.' }, 401);
  c.set('auth', state);
  await next();
};

export function requireRole(...roles: Role[]) {
  return async (c: Context, next: Next) => {
    const state = c.get('auth');
    if (!state) return c.json({ error: 'Authentification requise.' }, 401);
    if (!roles.includes(state.user.role)) {
      return c.json({ error: 'Droit insuffisant pour cette opération.' }, 403);
    }
    await next();
  };
}

export function actorName(c: Context): string {
  const state = c.get('auth');
  return state?.user.display_name ?? 'système';
}

export function actorId(c: Context): number | null {
  return c.get('auth')?.user.id ?? null;
}
