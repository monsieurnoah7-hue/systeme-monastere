import { Hono } from 'hono';
import { z } from 'zod';
import { get } from '@vercel/blob';
import { fkInsertionOrder } from '../db/fk-order.js';
import { getDb } from '../db/index.js';
import { env } from '../env.js';
import { writeAudit } from '../lib/audit.js';
import { BACKUP_PREFIX, blobAuth, dumpDatabase, dumpRowCount, gzipDump, listBackups, runCloudBackup } from '../lib/backup.js';
import { actorId, actorName, requireAuth, requireRole } from '../middleware/auth.js';

export const adminRoutes = new Hono();

adminRoutes.use('*', requireAuth);
adminRoutes.use('*', requireRole('direction'));

// Tables de données de démonstration remises à zéro par /reset-demo.
// Conservées : users, sessions, settings, role_permissions, _migrations, login_attempts.
const DEMO_TABLES = [
  'absences',
  'attendance',
  'audit_log',
  'employees',
  'loans',
  'magasins',
  'selfie_blobs',
  'stock_movements',
  'stock_refs',
  'terminals',
  'tool_events',
  'tools',
];

// Export complet de la base, téléchargeable depuis n'importe quel appareil.
adminRoutes.post('/backup', async (c) => {
  const dump = await dumpDatabase();
  const gz = gzipDump(dump);
  const stamp = new Date().toISOString().slice(0, 10);
  return c.body(new Uint8Array(gz), 200, {
    'Content-Type': 'application/gzip',
    'Content-Disposition': `attachment; filename="monastere-backup-${stamp}.json.gz"`,
    'X-Backup-Tables': String(Object.keys(dump.tables).length),
    'X-Backup-Rows': String(dumpRowCount(dump)),
  });
});

adminRoutes.get('/backups', async (c) => {
  const backups = await listBackups();
  backups.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  return c.json({ backups, retentionDays: env.backupRetentionDays });
});

// Téléchargement d'une sauvegarde déjà présente dans le cloud.
// Nom de paramètre `backup` et non `path` : le rewrite Vercel injecte déjà
// un paramètre parasite `path` qui l'écraserait.
adminRoutes.get('/backups/download', async (c) => {
  const path = c.req.query('backup') ?? '';
  if (!path.startsWith(BACKUP_PREFIX) || path.includes('..')) {
    return c.json({ error: 'Chemin de sauvegarde invalide.' }, 400);
  }
  try {
    const file = await get(path, { access: 'private', ...blobAuth() });
    if (!file) return c.json({ error: 'Sauvegarde introuvable dans le cloud.' }, 404);
    const filename = path.slice(path.lastIndexOf('/') + 1);
    return new Response(file.stream, {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(file.blob.size),
      },
    });
  } catch {
    return c.json({ error: 'Sauvegarde introuvable dans le cloud.' }, 404);
  }
});

// Sauvegarde manuelle vers le cloud (la même que le cron quotidien).
adminRoutes.post('/backup/save', async (c) => {
  const result = await runCloudBackup();
  return c.json({ ok: true, ...result });
});

const resetSchema = z.object({ confirm: z.string() });

adminRoutes.post('/reset-demo', async (c) => {
  const body = resetSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success || body.data.confirm !== 'RESET') {
    return c.json(
      { error: "Confirmation invalide : envoyez { \"confirm\": \"RESET\" } pour purger les données de démonstration." },
      400,
    );
  }

  const db = getDb();
  const counts: Record<string, number> = {};
  for (const table of DEMO_TABLES) {
    const row = await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM "${table}"`);
    counts[table] = row?.n ?? 0;
  }
  const employees = counts.employees ?? 0;
  const attendance = counts.attendance ?? 0;

  // Ordre sûr pour la purge : une table référençante (« enfant ») doit être
  // vidée avant la table qu'elle référence (ex. loans avant employees).
  const purgeOrder = (await fkInsertionOrder(db, DEMO_TABLES)).reverse();

  await db.transaction(async (tx) => {
    // On délie d'abord les comptes de leurs profils : sans ça, la purge des
    // employés supprimerait aussi la table users (et les sessions avec).
    await tx.query('UPDATE users SET employee_id = NULL WHERE employee_id IS NOT NULL');
    // DELETE et non TRUNCATE : TRUNCATE employees CASCADE se base sur le schéma
    // (et non sur les valeurs) et tronquerait users, sessions, etc.
    for (const table of purgeOrder) {
      await tx.query(`DELETE FROM "${table.replaceAll('"', '""')}"`);
    }
    // Retour à l'état neuf : compteurs d'identité remis à zéro.
    const identityCols = await tx.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND is_identity = 'YES' AND identity_generation = 'ALWAYS'`,
    );
    for (const { table_name, column_name } of identityCols) {
      if (!DEMO_TABLES.includes(table_name)) continue;
      await tx.query('SELECT setval(pg_get_serial_sequence($1, $2), 1, false)', [table_name, column_name]);
    }
    await writeAudit(tx, {
      entity: 'database',
      entityId: 'demo',
      action: 'reset_demo',
      actorId: actorId(c),
      actorName: actorName(c),
      reason: 'Purge des données de démonstration',
      after: counts,
    });
  });

  return c.json({
    ok: true,
    message: 'Données de démonstration purgées. Comptes, paramètres et sessions conservés.',
    purged: counts,
    totals: { employees, attendance },
    next: "Recréez vos employés (Écran Employés) puis réassociez leurs comptes (Écran Utilisateurs).",
  });
});

export { DEMO_TABLES };
