import type { Context, Next } from 'hono';
import { getDb } from '../db/index.js';
import { DEFAULT_PERMISSIONS, isSuperAdmin, type PermissionAction } from '../lib/permissions.js';
import type { Role } from '../types.js';

const cache = new Map<string, { allowed: boolean; at: number }>();
const TTL_MS = 30_000;

export async function hasPermission(role: string, action: PermissionAction): Promise<boolean> {
  if (isSuperAdmin(role as Role)) return true;
  const key = `${role}:${action}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.allowed;
  const row = await getDb().one<{ allowed: boolean }>(
    'SELECT allowed FROM role_permissions WHERE role = $1 AND action = $2',
    [role, action],
  );
  // fall back to the default role map when no explicit override exists
  const allowed = row ? row.allowed : (DEFAULT_PERMISSIONS[action] ?? []).includes(role as Role);
  cache.set(key, { allowed, at: Date.now() });
  return allowed;
}

export function invalidatePermissionCache(): void {
  cache.clear();
}

export function requirePerm(action: PermissionAction) {
  return async (c: Context, next: Next) => {
    const state = c.get('auth');
    if (!state) return c.json({ error: 'Authentification requise.' }, 401);
    const ok = await hasPermission(state.user.role, action);
    if (!ok) return c.json({ error: 'Droit insuffisant pour cette opération.' }, 403);
    await next();
  };
}
