import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { etag } from 'hono/etag';
import { compress } from 'hono/compress';
import { env } from './env.js';
import { adminRoutes } from './routes/admin.js';
import { attendanceRoutes } from './routes/attendance.js';
import { authRoutes } from './routes/auth.js';
import { cronRoutes } from './routes/cron.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { employeesRoutes } from './routes/employees.js';
import { kioskRoutes } from './routes/kiosk.js';
import { imagesRoutes } from './routes/images.js';
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
import { kitsRoutes } from './routes/kits.js';
import { fleetRoutes } from './routes/fleet.js';
import { projectsRoutes } from './routes/projects.js';
import { getSelfie } from './lib/selfie-store.js';
import { requireAuth } from './middleware/auth.js';
import { requirePerm } from './middleware/permissions.js';

export const app = new Hono();

const extraOrigins = ['http://127.0.0.1:5173', 'http://localhost:5173'];
const origins = [env.corsOrigin, ...extraOrigins].filter((o): o is string => Boolean(o));

app.use(
  '/api/*',
  cors({
    origin: origins,
    credentials: true,
  }),
);

app.use('/api/*', compress());
app.use('/api/*', etag());

app.get('/api/health', (c) => c.json({ ok: true, time: new Date().toISOString() }));

app.get('/files/selfies/:name', requireAuth, requirePerm('attendance.view'), async (c) => {
  const name = c.req.param('name') ?? '';
  if (!/^[A-Za-z0-9_\-]+\.jpg$/.test(name)) return c.notFound();
  const file = await getSelfie(name);
  if (!file) return c.notFound();
  return c.body(new Uint8Array(file.data), 200, {
    'Content-Type': file.contentType,
    'Cache-Control': 'private, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  });
});

app.route('/api/auth', authRoutes);
app.route('/api/images', imagesRoutes);
app.route('/api/me', meRoutes);
app.route('/api/kiosk', kioskRoutes);
app.route('/api/tools', toolsRoutes);
app.route('/api/loans', loansRoutes);
app.route('/api/magasins', magasinsRoutes);
app.route('/api/employees', employeesRoutes);
app.route('/api/attendance', attendanceRoutes);
app.route('/api/leaves', leavesRoutes);
app.route('/api/stock', stockRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/terminals', terminalsRoutes);
app.route('/api/users', usersRoutes);
app.route('/api/permissions', permissionsRoutes);
app.route('/api/scan', scanRoutes);
app.route('/api/cron', cronRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/kits', kitsRoutes);
app.route('/api/fleet', fleetRoutes);
app.route('/api/projects', projectsRoutes);

app.onError((err, c) => {
  console.error('[api error]', err);
  const message = err instanceof Error ? err.message : 'Erreur interne du serveur.';
  return c.json({ error: message }, 500);
});

app.notFound((c) => c.json({ error: 'Route introuvable.' }, 404));
