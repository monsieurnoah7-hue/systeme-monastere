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

if (!dbUrl) {
  console.error('DATABASE_URL introuvable dans .env.production.local');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

async function check() {
  const client = await pool.connect();
  try {
    const rolesRes = await client.query('SELECT * FROM roles ORDER BY id');
    console.log('--- RÔLES EN BASE ---');
    console.table(rolesRes.rows);

    const empRes = await client.query(`
      SELECT e.id, e.full_name, e.job_title, e.active,
             u.id AS user_id, u.login, u.role, u.active AS user_active
      FROM employees e
      LEFT JOIN users u ON u.employee_id = e.id
      ORDER BY e.id
    `);
    console.log(`--- TRAVAILLEURS (${empRes.rows.length} au total) ---`);
    console.table(empRes.rows);

    // Summary
    const withAccount = empRes.rows.filter(r => r.user_id !== null);
    const withoutAccount = empRes.rows.filter(r => r.user_id === null);
    console.log(`Avec compte: ${withAccount.length}, Sans compte: ${withoutAccount.length}`);
  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(err => {
  console.error('Erreur:', err);
  process.exit(1);
});
