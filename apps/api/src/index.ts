import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { app } from './app.js';
import { env } from './env.js';
import { migrate } from './db/migrate.js';
import { ensureBootstrapAdmin } from './routes/auth.js';

app.use('/files/*', serveStatic({ root: './', rewriteRequestPath: (p) => p.replace(/^\/files/, env.dataDir) }));

async function main() {
  await migrate();
  await ensureBootstrapAdmin();
  serve({ fetch: app.fetch, port: env.port }, (info) => {
    console.log(`[api] http://127.0.0.1:${info.port} (${env.databaseUrl ? 'postgres' : 'pglite'})`);
  });
}

main().catch((err) => {
  console.error('[api] échec de démarrage', err);
  process.exit(1);
});
