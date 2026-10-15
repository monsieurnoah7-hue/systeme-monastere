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
};
