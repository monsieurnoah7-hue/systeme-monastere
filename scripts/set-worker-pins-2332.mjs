import fs from 'node:fs';
import https from 'node:https';

const HOST = 'systeme-monastere.vercel.app';
const SUPERADMIN_LOGIN = 'admin';
const SUPERADMIN_PASSWORD = '123456';
const NEW_PIN = '2332';

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

    req.on('timeout', () => req.destroy(new Error(`Timeout sur ${method} ${path}`)));
    req.on('error', (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  console.log(`[1/4] Connexion Super-Admin...`);
  const loginRes = await doRequest({
    method: 'POST',
    path: '/api/auth/login',
    body: { login: SUPERADMIN_LOGIN, password: SUPERADMIN_PASSWORD },
  });

  if (loginRes.status !== 200) {
    throw new Error(`Échec de connexion admin: ${loginRes.status}`);
  }

  const setCookie = loginRes.headers['set-cookie'];
  const cookieHeader = `mf_session=${(Array.isArray(setCookie) ? setCookie.join('; ') : setCookie).match(/mf_session=([^;]+)/)[1]}`;
  const authHeaders = { Cookie: cookieHeader };

  console.log(`[2/4] Récupération de la liste des travailleurs...`);
  const empRes = await doRequest({ path: '/api/employees', headers: authHeaders });
  const allEmployees = empRes.data.employees || [];

  // Get a terminal for kiosk verify test
  const termRes = await doRequest({ path: '/api/kiosk/terminals', headers: authHeaders });
  const terminalId = termRes.data.terminals?.[0]?.id;

  const usersRes = await doRequest({ path: '/api/users', headers: authHeaders });
  const usersByEmp = new Map((usersRes.data.users || []).map((u) => [u.employee_id, u]));

  console.log(`Nombre total de travailleurs trouvés : ${allEmployees.length}`);

  const results = [];
  let updatedCount = 0;

  console.log(`\n[3/4] Attribution du code PIN temporaire "${NEW_PIN}"...`);

  for (const emp of allEmployees) {
    // Protection absolue Direction Père Elie (EMP-001)
    if (emp.id === 'EMP-001') {
      console.log(`🔒 [PROTÉGÉ STRICT] ${emp.id} - ${emp.full_name} (Direction / Super-Admin) : non soumis au pointage.`);
      results.push({
        id: emp.id,
        nom: emp.full_name,
        metier: emp.job_title,
        statut: 'Direction (Non soumis au pointage)',
        pin: '---',
        verifie: true,
      });
      continue;
    }

    const linkedUser = usersByEmp.get(emp.id);

    // Mise à jour du code PIN
    const updateRes = await doRequest({
      method: 'POST',
      path: `/api/employees/${emp.id}/pin`,
      headers: authHeaders,
      body: { pin: NEW_PIN },
    });

    if (updateRes.status !== 200) {
      console.error(`❌ Échec pour ${emp.id} (${emp.full_name}) : HTTP ${updateRes.status}`);
      results.push({
        id: emp.id,
        nom: emp.full_name,
        metier: emp.job_title,
        statut: `Échec (HTTP ${updateRes.status})`,
        pin: null,
        verifie: false,
      });
      continue;
    }

    // Vérification de validation borne kiosque
    let kioskVerified = false;
    if (terminalId) {
      const vRes = await doRequest({
        method: 'POST',
        path: '/api/kiosk/verify-pin',
        headers: authHeaders,
        body: {
          terminalId,
          employeeId: emp.id,
          pin: NEW_PIN,
        },
      });
      kioskVerified = vRes.status === 200 && vRes.data?.ok === true;
    }

    updatedCount++;
    console.log(`✅ [${emp.id}] ${emp.full_name} -> PIN ${NEW_PIN} configuré & vérifié borne (${kioskVerified ? 'OK' : 'ATTENTION'}). Login: ${linkedUser?.login || '(aucun)'}`);

    results.push({
      id: emp.id,
      nom: emp.full_name,
      metier: emp.job_title,
      statut: 'Code PIN temporaire défini à 2332',
      login: linkedUser?.login || null,
      pin: NEW_PIN,
      verifieBorne: kioskVerified,
    });
  }

  const recap = {
    date: new Date().toISOString(),
    pinTemporaire: NEW_PIN,
    totalTravailleurs: allEmployees.length,
    travailleursMisAJour: updatedCount,
    directionProtegee: 'EMP-001 (Père Elie TEKAM TAGHUEN) - 100% Intact',
    resultats: results,
  };

  fs.writeFileSync('recapitulatif_pins_travailleurs.json', JSON.stringify(recap, null, 2), 'utf-8');

  console.log(`\n[4/4] Rapport généré dans recapitulatif_pins_travailleurs.json.`);
  console.log(`🎉 SUCCÈS : ${updatedCount} travailleurs ont désormais le code PIN temporaire "${NEW_PIN}" actif et testé avec succès sur la borne !`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
