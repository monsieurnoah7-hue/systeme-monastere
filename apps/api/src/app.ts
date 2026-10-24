import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { env } from './env.js';
import { adminRoutes } from './routes/admin.js';
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

app.get('/api/health', (c) => c.json({ ok: true, time: new Date().toISOString() }));

app.route('/api/auth', authRoutes);
app.route('/api/images', imagesRoutes);
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
app.route('/api/cron', cronRoutes);
app.route('/api/admin', adminRoutes);

app.notFound((c) => c.json({ error: 'Route introuvable.' }, 404));
