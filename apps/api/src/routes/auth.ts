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

// Verrou anti force-brute : 5 échecs glissants → compte bloqué 15 min.
// Persisté en base (et non en mémoire) pour rester fiable sur Vercel,
// dont les instances serverless ne partagent pas leur état.
const MAX_LOGIN_FAILS = 5;
const LOGIN_WINDOW_MIN = 15;

export const authRoutes = new Hono();

authRoutes.post('/login', async (c) => {
  const body = loginSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Identifiant et mot de passe requis.' }, 400);

  const db = getDb();
  const login = body.data.login.trim().toLowerCase();
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || null;

  await db.query("DELETE FROM login_attempts WHERE created_at < now() - interval '1 day'");
  const recent = await db.one<{ first: string | null; n: number }>(
    `SELECT min(created_at)::text AS first, count(*)::int AS n
       FROM login_attempts WHERE login = $1 AND created_at > now() - interval '${LOGIN_WINDOW_MIN} minutes'`,
    [login],
  );
  if ((recent?.n ?? 0) >= MAX_LOGIN_FAILS) {
    const retryAfter = recent?.first
      ? Math.max(1, Math.ceil((new Date(recent.first).getTime() + LOGIN_WINDOW_MIN * 60_000 - Date.now()) / 1000))
      : LOGIN_WINDOW_MIN * 60;
    return c.json(
      { error: `Trop de tentatives échouées. Compte bloqué pendant ${Math.ceil(retryAfter / 60)} min.`, locked: true },
      429,
      { 'Retry-After': String(retryAfter) },
    );
  }

  const user = await db.one<{ id: number; password_hash: string; active: boolean }>(
    'SELECT id, password_hash, active FROM users WHERE login = $1',
    [login],
  );
  if (!user || !user.active || !verifyPassword(body.data.password, user.password_hash)) {
    await db.query('INSERT INTO login_attempts (login, ip) VALUES ($1, $2)', [login, ip]);
    const after = await db.one<{ n: number }>(
      `SELECT count(*)::int AS n FROM login_attempts WHERE login = $1 AND created_at > now() - interval '${LOGIN_WINDOW_MIN} minutes'`,
      [login],
    );
    const remaining = MAX_LOGIN_FAILS - (after?.n ?? 0);
    return c.json(
      {
        error:
          remaining > 0
            ? `Identifiant ou mot de passe incorrect (${remaining} tentative${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}).`
            : 'Identifiant ou mot de passe incorrect. Compte bloqué 15 minutes.',
      },
      401,
    );
  }

  await db.query('DELETE FROM login_attempts WHERE login = $1', [login]);

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

  const state = await db.one<{ id: number; login: string; display_name: string; role: UserRow['role']; employee_id: string | null; photo_path: string | null }>(
    `SELECT u.id, u.login, u.display_name, u.role, u.employee_id, coalesce(u.photo_path, e.photo_path) AS photo_path
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id
      WHERE u.id = $1`,
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

const profileSchema = z.object({
  display_name: z.string().min(2).max(100).optional(),
  current_password: z.string().optional(),
  new_password: z.string().min(6).max(100).optional(),
  photo_path: z.string().nullable().optional(),
});

authRoutes.patch('/profile', requireAuth, async (c) => {
  const body = profileSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? 'Données de profil invalides.' }, 400);
  }
  const db = getDb();
  const auth = c.get('auth');
  const userId = auth.user.id;

  const current = await db.one<{ id: number; password_hash: string; employee_id: string | null }>(
    'SELECT id, password_hash, employee_id FROM users WHERE id = $1',
    [userId],
  );
  if (!current) return c.json({ error: 'Utilisateur introuvable.' }, 404);

  if (body.data.new_password) {
    if (!body.data.current_password || !verifyPassword(body.data.current_password, current.password_hash)) {
      return c.json({ error: 'Le mot de passe actuel est incorrect.' }, 400);
    }
  }

  const newHash = body.data.new_password ? hashPassword(body.data.new_password) : undefined;
  const newName = body.data.display_name?.trim() || undefined;
  const newPhoto = body.data.photo_path !== undefined ? (body.data.photo_path ? body.data.photo_path.trim() : null) : undefined;

  await db.query(
    `UPDATE users SET
       display_name = coalesce($1, display_name),
       password_hash = coalesce($2, password_hash),
       photo_path = CASE WHEN $3::text IS NOT NULL THEN (CASE WHEN $3 = '' THEN NULL ELSE $3 END) ELSE photo_path END
     WHERE id = $4`,
    [newName ?? null, newHash ?? null, newPhoto !== undefined ? (newPhoto || '') : null, userId],
  );

  // Si l'utilisateur est lié à une fiche travailleur, synchroniser la photo
  if (newPhoto !== undefined && current.employee_id) {
    await db.query('UPDATE employees SET photo_path = $1 WHERE id = $2', [newPhoto, current.employee_id]);
  }

  const updated = await db.one<UserRow>(
    `SELECT u.id, u.login, u.display_name, u.role, u.employee_id, coalesce(u.photo_path, e.photo_path) AS photo_path
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id
      WHERE u.id = $1`,
    [userId],
  );
  return c.json({ ok: true, user: updated });
});

authRoutes.post('/profile/photo', requireAuth, async (c) => {
  const body = z.object({ photo_path: z.string().nullable() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Photo invalide.' }, 400);

  const db = getDb();
  const auth = c.get('auth');
  const userId = auth.user.id;
  const photo = body.data.photo_path || null;

  const user = await db.one<{ id: number; employee_id: string | null }>(
    'SELECT id, employee_id FROM users WHERE id = $1',
    [userId],
  );
  if (!user) return c.json({ error: 'Utilisateur introuvable.' }, 404);

  await db.query('UPDATE users SET photo_path = $1 WHERE id = $2', [photo, userId]);
  if (user.employee_id) {
    await db.query('UPDATE employees SET photo_path = $1 WHERE id = $2', [photo, user.employee_id]);
  }

  return c.json({ ok: true, photo_path: photo });
});

export async function ensureBootstrapAdmin(): Promise<void> {
  const db = getDb();
  const row = await db.one<{ count: string }>('SELECT count(*)::text AS count FROM users');
  if (Number(row?.count ?? 0) > 0) return;
  const hash = hashPassword(env.bootstrapPassword);
  const inserted = await db.query<{ id: number }>(
    `INSERT INTO users (login, password_hash, display_name, role)
     VALUES ('direction', $1, 'Direction du Monastère', 'direction')
     ON CONFLICT (login) DO NOTHING
     RETURNING id`,
    [hash],
  );
  if (inserted.length > 0) console.log('[auth] compte direction initial créé (login: direction)');
}
