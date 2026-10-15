import type { Sql } from '../db/index.js';

export type AuditEntry = {
  entity: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  actorId?: number | null;
  actorName: string;
  reason?: string | null;
};

export async function writeAudit(sql: Sql, entry: AuditEntry): Promise<void> {
  await sql.query(
    `INSERT INTO audit_log (entity, entity_id, action, before, after, actor_id, actor_name, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.entity,
      entry.entityId,
      entry.action,
      entry.before == null ? null : JSON.stringify(entry.before),
      entry.after == null ? null : JSON.stringify(entry.after),
      entry.actorId ?? null,
      entry.actorName,
      entry.reason ?? null,
    ],
  );
}
