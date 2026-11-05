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
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: parsed,
          });
        });
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error(`Timeout de 25s dépassé sur ${method} ${path}`));
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function requestWithRetry(options, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await doRequest(options);
      if (res.status >= 500) {
        throw new Error(`Erreur serveur ${res.status}`);
      }
      return res;
    } catch (err) {
      if (i === retries) throw err;
      console.warn(`[Retry ${i}/${retries}] Erreur sur ${options.path}: ${err.message}. Pause 1.5s...`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

function generateLogin(fullName, existingLogins) {
  const cleanName = fullName
    .replace(/^(Père|Frère|M\.|Mme|Prof\.|Docteur|Dr)\s+/i, '')
    .trim();

  const parts = cleanName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  let base = '';
  if (parts.length >= 2) {
    base = `${parts[0][0]}${parts[parts.length - 1]}`;
  } else if (parts.length === 1) {
    base = parts[0];
  } else {
    base = 'user';
  }

  if (base.length < 3) base = base.padEnd(3, '1');
  base = base.slice(0, 20);

  let candidate = base;
  let counter = 1;
  while (existingLogins.has(candidate)) {
    counter++;
    candidate = `${base}${counter}`;
  }

  existingLogins.add(candidate);
  return candidate;
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

async function main() {
  console.log(`[1/5] Authentification Super-Admin sur https://${HOST}...`);
  const loginRes = await requestWithRetry({
    method: 'POST',
    path: '/api/auth/login',
    body: { login: SUPERADMIN_LOGIN, password: SUPERADMIN_PASSWORD },
  });

  if (loginRes.status !== 200) {
    throw new Error(`Échec login : ${loginRes.status} ${JSON.stringify(loginRes.data)}`);
  }

  const setCookie = loginRes.headers['set-cookie'];
  const sessionCookie = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie || '';
  const match = sessionCookie.match(/mf_session=([^;]+)/);
  if (!match) throw new Error('Cookie mf_session non reçu');
  const cookieHeader = `mf_session=${match[1]}`;
  console.log('✓ Connecté avec succès en Super-Admin (Direction).');

  const authHeaders = { Cookie: cookieHeader };

  console.log('[2/5] Récupération de l’état actuel...');
  const empRes = await requestWithRetry({ path: '/api/employees', headers: authHeaders });
  const userRes = await requestWithRetry({ path: '/api/users', headers: authHeaders });

  const rawEmployees = empRes.data.employees || [];
  const users = userRes.data.users || [];

  const empMap = new Map();
  for (const e of rawEmployees) {
    if (!empMap.has(e.id)) {
      empMap.set(e.id, e);
    }
  }
  const employees = Array.from(empMap.values()).sort((a, b) => a.id.localeCompare(b.id));

  console.log(`✓ ${employees.length} travailleurs uniques répertoriés.`);
  console.log(`✓ ${users.length} comptes applicatifs actuels.`);

  const existingLogins = new Set(users.map((u) => u.login.toLowerCase()));
  const usersByEmpId = new Map();
  for (const u of users) {
    if (u.employee_id) {
      usersByEmpId.set(u.employee_id, u);
    }
  }

  const results = [];
  let accountsPreserved = 0;
  let accountsLinked = 0;
  let accountsCreated = 0;

  console.log('[3/5] Configuration et audit de chaque profil...');

  for (const emp of employees) {
    // RÈGLE CRITIQUE : Protection stricte de Père Elie EMP-001
    if (emp.id === 'EMP-001' || emp.full_name.includes('Père Elie')) {
      console.log(`  -> [PROTÉGÉ STRICT] ${emp.id} ${emp.full_name} : Inchangé.`);
      const u = usersByEmpId.get(emp.id) || users.find((x) => x.login === 'direction');
      results.push({
        matricule: emp.id,
        nom: emp.full_name,
        metier: emp.job_title,
        statutCompte: 'Conservé intact (Super-Admin)',
        login: u?.login || 'direction',
        role: 'direction',
        motDePasseTemp: '--- (INCHANGÉ / PROTÉGÉ) ---',
        verifie: true,
      });
      continue;
    }

    // Cas 1 : Travailleur ayant déjà un compte lié
    const linkedUser = usersByEmpId.get(emp.id);
    if (linkedUser) {
      accountsPreserved++;
      console.log(`  -> [CONSERVÉ] ${emp.id} ${emp.full_name} : Déjà lié au compte @${linkedUser.login} (Rôle: ${linkedUser.role})`);
      results.push({
        matricule: emp.id,
        nom: emp.full_name,
        metier: emp.job_title,
        statutCompte: 'Compte existant conservé',
        login: linkedUser.login,
        role: linkedUser.role,
        motDePasseTemp: '--- (EXISTANT / ACTIF) ---',
        verifie: true,
      });
      continue;
    }

    // Cas 2 : Compte orphelin préexistant (ex: M. ABDOULAYE NJARAYAM)
    const matchingOrphan = users.find((u) => {
      if (u.employee_id) return false;
      const cleanU = u.display_name.toLowerCase().replace(/[^a-z]/g, '');
      const cleanE = emp.full_name.toLowerCase().replace(/[^a-z]/g, '');
      return cleanU.length > 5 && (cleanU.includes(cleanE) || cleanE.includes(cleanU));
    });

    if (matchingOrphan) {
      console.log(`  -> [LIAISON COMPTE EXISTANT] ${emp.id} ${emp.full_name} <-> @${matchingOrphan.login} (id: ${matchingOrphan.id})`);
      const newPassword = generateTempPassword();
      const patchRes = await requestWithRetry({
        method: 'PATCH',
        path: `/api/users/${matchingOrphan.id}`,
        headers: authHeaders,
        body: {
          employee_id: emp.id,
          password: newPassword,
          active: true,
        },
      });

      if (patchRes.status !== 200) {
        throw new Error(`Échec liaison ${emp.id}: ${patchRes.status} ${JSON.stringify(patchRes.data)}`);
      }

      // Vérification dans la fiche détaillée
      const check = await requestWithRetry({ path: `/api/employees/${emp.id}/detail`, headers: authHeaders });
      if (!check.data.account || check.data.account.login !== matchingOrphan.login) {
        throw new Error(`Contrôle échoué pour la liaison de ${emp.id}`);
      }

      accountsLinked++;
      results.push({
        matricule: emp.id,
        nom: emp.full_name,
        metier: emp.job_title,
        statutCompte: 'Compte existant rattaché & réactivé',
        login: matchingOrphan.login,
        role: matchingOrphan.role,
        motDePasseTemp: newPassword,
        verifie: true,
      });
      continue;
    }

    // Cas 3 : Nouveau compte à créer
    const role = 'travailleur';
    const login = generateLogin(emp.full_name, existingLogins);
    const password = generateTempPassword();

    console.log(`  -> [CRÉATION] ${emp.id} ${emp.full_name} -> Login: @${login}, Rôle: ${role}`);

    const createRes = await requestWithRetry({
      method: 'POST',
      path: '/api/users',
      headers: authHeaders,
      body: {
        login,
        display_name: emp.full_name,
        password,
        role,
        employee_id: emp.id,
      },
    });

    if (createRes.status !== 201) {
      throw new Error(`Échec création ${emp.id}: ${createRes.status} ${JSON.stringify(createRes.data)}`);
    }

    // Contrôle fiche immédiat sur l'API officielle
    const check = await requestWithRetry({ path: `/api/employees/${emp.id}/detail`, headers: authHeaders });
    if (!check.data.account || check.data.account.login !== login) {
      throw new Error(`Contrôle échoué : fiche ${emp.id} ne présente pas le compte @${login}`);
    }

    accountsCreated++;
    results.push({
      matricule: emp.id,
      nom: emp.full_name,
      metier: emp.job_title,
      statutCompte: 'Nouveau compte créé & activé',
      login,
      role,
      motDePasseTemp: password,
      verifie: true,
    });

    // Petite pause de 300ms entre chaque création pour un déroulement fluide
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log('[4/5] Sauvegarde du rapport complet...');
  const summary = {
    date: new Date().toISOString(),
    totalTravailleurs: employees.length,
    comptesExistantsConserves: accountsPreserved,
    comptesExistantsRattaches: accountsLinked,
    nouveauxComptesCrees: accountsCreated,
    compteDirectionProtege: 'EMP-001 (Père Elie TEKAM TAGHUEN) - 100% Intact',
    resultats: results,
  };

  fs.writeFileSync('recapitulatif_comptes_travailleurs.json', JSON.stringify(summary, null, 2), 'utf-8');
  console.log('\n=== RÉSUMÉ DES OPÉRATIONS ===');
  console.log(`✓ Total travailleurs audités : ${employees.length}`);
  console.log(`✓ Comptes existants conservés : ${accountsPreserved}`);
  console.log(`✓ Compte existant rattaché : ${accountsLinked}`);
  console.log(`✓ Nouveaux comptes créés : ${accountsCreated}`);
  console.log('✓ Tous les profils sont désormais configurés et vérifiés.');
}

main().catch((err) => {
  console.error('\nERREUR :', err);
  process.exit(1);
});
