import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { env } from './env.js';
import { migrate } from './db/migrate.js';
import { authRoutes, ensureBootstrapAdmin } from './routes/auth.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { employeesRoutes } from './routes/employees.js';
import { kioskRoutes } from './routes/kiosk.js';
import { leavesRoutes } from './routes/leaves.js';
import { loansRoutes } from './routes/loans.js';
import { magasinsRoutes } from './routes/magasins.js';
import { meRoutes } from './routes/me.js';
import { permissionsRoutes } from './routes/permissions.js';
import { scanRoutes } from './routes/scan.js';
import { settingsRoutes } from './routes/settings.js';
import { stockRoutes } from './routes/stock.js';
import { terminalsRoutes } from './routes/terminals.js';
import { toolsRoutes } from './routes/tools.js';
import { usersRoutes } from './routes/users.js';

const app = new Hono();

app.use(
  '/api/*',
  cors({
    origin: [env.corsOrigin, 'http://127.0.0.1:5173', 'http://localhost:5173'],
    credentials: true,
  }),
);

app.get('/api/health', (c) => c.json({ ok: true, time: new Date().toISOString() }));

app.route('/api/auth', authRoutes);
app.route('/api/me', meRoutes);
app.route('/api/kiosk', kioskRoutes);
app.route('/api/tools', toolsRoutes);
app.route('/api/loans', loansRoutes);
app.route('/api/magasins', magasinsRoutes);
app.route('/api/employees', employeesRoutes);
app.route('/api/leaves', leavesRoutes);
app.route('/api/stock', stockRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/terminals', terminalsRoutes);
app.route('/api/users', usersRoutes);
app.route('/api/permissions', permissionsRoutes);
app.route('/api/scan', scanRoutes);

app.use('/files/*', serveStatic({ root: './', rewriteRequestPath: (p) => p.replace(/^\/files/, env.dataDir) }));

app.notFound((c) => c.json({ error: 'Route introuvable.' }, 404));

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
