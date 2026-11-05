import fs from 'node:fs';
import https from 'node:https';

const HOST = 'systeme-monastere.vercel.app';
const SUPERADMIN_LOGIN = 'admin';
const SUPERADMIN_PASSWORD = '123456';
const NEW_PASSWORD = '000000';

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

async function run() {
  console.log(`[1/3] Connexion Super-Admin...`);
  const loginRes = await doRequest({
    method: 'POST',
    path: '/api/auth/login',
    body: { login: SUPERADMIN_LOGIN, password: SUPERADMIN_PASSWORD },
  });
  const setCookie = loginRes.headers['set-cookie'];
  const cookieHeader = `mf_session=${(Array.isArray(setCookie) ? setCookie.join('; ') : setCookie).match(/mf_session=([^;]+)/)[1]}`;
  const authHeaders = { Cookie: cookieHeader };

  console.log(`[2/3] Récupération des utilisateurs...`);
  const uRes = await doRequest({ path: '/api/users', headers: authHeaders });
  const allUsers = uRes.data.users || [];

  const reportPath = 'recapitulatif_comptes_travailleurs.json';
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

  let updatedCount = 0;

  for (const item of report.resultats) {
    // STRICT PROTECTION : Ne jamais toucher à Père Elie EMP-001 ou au super admin
    if (item.matricule === 'EMP-001' || item.login === 'direction' || item.login === 'admin') {
      console.log(`[PROTÉGÉ STRICT] ${item.matricule} (${item.nom}) - Inchangé.`);
      continue;
    }

    const user = allUsers.find((u) => u.login === item.login || (u.employee_id && u.employee_id === item.matricule));
    if (!user) {
      console.warn(`Utilisateur non trouvé pour ${item.matricule} (${item.login})`);
      continue;
    }

    console.log(`Mise à jour mot de passe pour ${item.matricule} (@${user.login}, id: ${user.id}) -> "${NEW_PASSWORD}"...`);
    const pRes = await doRequest({
      method: 'PATCH',
      path: `/api/users/${user.id}`,
      headers: authHeaders,
      body: { password: NEW_PASSWORD },
    });

    if (pRes.status !== 200) {
      throw new Error(`Échec patch user ${user.id}: ${pRes.status} ${JSON.stringify(pRes.data)}`);
    }

    item.motDePasseTemp = NEW_PASSWORD;
    item.statutCompte = 'Mot de passe défini à 000000';
    updatedCount++;
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n[3/3] Terminé : ${updatedCount} comptes mis à jour avec le mot de passe "${NEW_PASSWORD}".`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
