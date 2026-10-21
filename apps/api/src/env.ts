import { existsSync, readFileSync } from 'node:fs';

// Environnement local du monorepo : en dev, `tsx watch` tourne avec CWD =
// `apps/api`, alors que `vercel env pull` place `.env.local` à la racine.
// On charge les fichiers du plus spécifique au plus général ; la première
// valeur définie gagne, celles déjà présentes dans process.env (Vercel,
// shell, CI) restent prioritaires. Sur Vercel, aucun fichier n'existe → no-op.
// Le `.env` racine (configuration Docker : POSTGRES_*, CORS…) est volontairement
// exclu : il ne s'applique pas au serveur de développement.
const envCandidates = ['.env.local', '.env', '../../.env.local'];
for (const file of envCandidates) {
  if (!existsSync(file)) continue;
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(file);
      continue;
    } catch {
      /* parser ci-dessous */
    }
  }
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    const [, key, raw] = m;
    if (key === undefined || raw === undefined || process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^(['"])(.*)\1$/, '$2');
  }
}

const required = (key: string, fallback: string) => process.env[key]?.trim() || fallback;

export const env = {
  port: Number(process.env.PORT ?? 8787),
  databaseUrl: process.env.DATABASE_URL?.trim() || '',
  dataDir: required('DATA_DIR', 'data'),
  nodeEnv: required('NODE_ENV', 'development'),
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 12),
  bootstrapPassword: process.env.BOOTSTRAP_PASSWORD?.trim() || 'direction226',
  corsOrigin: required('CORS_ORIGIN', 'http://localhost:5173'),
  isProd: (process.env.NODE_ENV ?? 'development') === 'production',
  cronSecret: process.env.CRON_SECRET?.trim() || '',
  // `.env.local` (généré par `vercel`) entoure les valeurs de guillemets :
  // on les retire, sinon le SDK Blob reçoit `"..."` et refuse le jeton.
  blobToken: process.env.BLOB_READ_WRITE_TOKEN?.trim().replace(/^"+|"+$/g, '') || '',
  backupRetentionDays: Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS ?? 30)),
};
