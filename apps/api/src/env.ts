const required = (key: string, fallback: string) => process.env[key]?.trim() || fallback;

export const env = {
  port: Number(process.env.PORT ?? 8787),
  databaseUrl: process.env.DATABASE_URL?.trim() || '',
  dataDir: required('DATA_DIR', 'data'),
  nodeEnv: required('NODE_ENV', 'development'),
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 12),
  bootstrapPassword: process.env.BOOTSTRAP_PASSWORD?.trim() || 'admin226',
  corsOrigin: required('CORS_ORIGIN', 'http://localhost:5173'),
  isProd: (process.env.NODE_ENV ?? 'development') === 'production',
  cronSecret: process.env.CRON_SECRET?.trim() || '',
  // `.env.local` (généré par `vercel`) entoure les valeurs de guillemets :
  // on les retire, sinon le SDK Blob reçoit `"..."` et refuse le jeton.
  blobToken: process.env.BLOB_READ_WRITE_TOKEN?.trim().replace(/^"+|"+$/g, '') || '',
  backupRetentionDays: Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS ?? 30)),
};
