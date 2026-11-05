import fs from 'node:fs';
import pg from 'pg';

const envContent = fs.readFileSync('.env.production.local', 'utf-8');
let dbUrl = '';
for (const line of envContent.split('\n')) {
  const match = line.match(/^DATABASE_URL=(.*)$/);
  if (match) {
    dbUrl = match[1].trim().replace(/^["']|["']$/g, '');
    break;
  }
}

const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
try {
  const res = await client.query('SELECT e.id, e.full_name, e.badge_token, u.login, u.password_hash IS NOT NULL as has_pass FROM employees e LEFT JOIN users u ON u.employee_id = e.id LIMIT 6');
  console.table(res.rows);
} finally {
  client.release();
  await pool.end();
}
