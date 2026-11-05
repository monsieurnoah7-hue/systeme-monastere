import fs from 'node:fs';
import https from 'node:https';

const HOST = 'systeme-monastere.vercel.app';
const SUPERADMIN_LOGIN = 'admin';
const SUPERADMIN_PASSWORD = '123456';

const agent = new https.Agent({ keepAlive: true });

function doRequest({ method = 'GET', path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      ...headers,
      Host: HOST,
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
    };

    const req = https.request(
      {
        hostname: HOST,
        port: 443,
        path,
        method,
        headers: reqHeaders,
        agent,
        timeout: 25000,
      },
      (res) => {
        let responseBody = '';
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(responseBody);
          } catch {
            parsed = responseBody;
          }
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        });
      },
    );

    req.on('timeout', () => req.destroy(new Error(`Timeout de 25s sur ${method} ${path}`)));
    req.on('error', (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

function generateTempPassword() {
  const chars = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  let pass = 'Mf@';
  for (let i = 0; i < 7; i++) {
    pass += chars[Math.floor(Math.random() * chars.length)];
  }
  pass += '!';
  return pass;
}

async function run() {
  console.log('Connexion...');
  const loginRes = await doRequest({
    method: 'POST',
    path: '/api/auth/login',
    body: { login: SUPERADMIN_LOGIN, password: SUPERADMIN_PASSWORD },
  });
  const setCookie = loginRes.headers['set-cookie'];
  const cookieHeader = `mf_session=${(Array.isArray(setCookie) ? setCookie.join('; ') : setCookie).match(/mf_session=([^;]+)/)[1]}`;
  const authHeaders = { Cookie: cookieHeader };

  // Targets : Existing accounts to reset passwords for
  const targets = [
    { empId: 'EMP-002', name: 'Frère François MEKELI, OSB', login: 'mekeli' },
    { empId: 'EMP-003', name: 'M. KOUOMOU Désiré', login: 'kouomou' },
    { empId: 'EMP-005', name: 'Mme ÉTOGA Joséphine', login: 'mme.etoga.josephine' },
    { empId: 'EMP-006', name: 'M. LAWSON ADODO François', login: 'chef' },
    { empId: 'EMP-007', name: 'M. MVOGO Médard', login: 'mvogo' },
    { empId: 'EMP-008', name: 'M. MINKOUMBA ABONDO Clément', login: 'magasinier' },
    { empId: 'EMP-016', name: 'M. AHANGA EMARAM Sylvain', login: 'ouvrier' },
    { empId: 'EMP-017', name: 'M. BAHETEN Jean Marcel', login: 'bmarcel' },
  ];

  // Fetch users to get user IDs
  const uRes = await doRequest({ path: '/api/users', headers: authHeaders });
  const allUsers = uRes.data.users;

  // Read existing report
  const reportPath = 'recapitulatif_comptes_travailleurs.json';
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

  for (const t of targets) {
    const user = allUsers.find((u) => u.login === t.login || u.employee_id === t.empId);
    if (!user) {
      console.warn(`Utilisateur non trouvé pour ${t.empId} (${t.login})`);
      continue;
    }

    // STRICT CHECK : Jamais EMP-001
    if (user.employee_id === 'EMP-001' || user.login === 'direction') {
      console.warn('PROTECTION ACTIVE : EMP-001 / direction ignoré.');
      continue;
    }

    const newPass = generateTempPassword();
    console.log(`Mise à jour mot de passe pour ${t.empId} (@${user.login}, id: ${user.id})...`);
    const pRes = await doRequest({
      method: 'PATCH',
      path: `/api/users/${user.id}`,
      headers: authHeaders,
      body: { password: newPass },
    });

    if (pRes.status !== 200) {
      throw new Error(`Échec patch user ${user.id}: ${pRes.status}`);
    }

    // Update in report
    const item = report.resultats.find((r) => r.matricule === t.empId);
    if (item) {
      item.motDePasseTemp = newPass;
      item.statutCompte = 'Mot de passe temporaire initialisé';
    }
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log('Mise à jour terminée avec succès.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
