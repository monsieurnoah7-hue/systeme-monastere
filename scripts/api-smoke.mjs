const BASE = process.env.API_BASE ?? 'http://127.0.0.1:8787';

let cookie = '';
let failures = 0;

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* corps non JSON */
  }
  return { status: res.status, json };
}

function check(label, cond, detail) {
  const ok = cond ? 'OK ' : 'FAIL';
  if (!cond) failures += 1;
  console.log(`${ok} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function login(login, password) {
  cookie = '';
  const res = await call('POST', '/api/auth/login', { login, password });
  return res.status === 200;
}

// 1. connexion direction
check('login direction', await login('direction', 'direction226'));

// 2. références de stock
const ref = await call('POST', '/api/stock/refs', {
  name: 'Vis inox 5×60 (boîte 200)',
  category: 'Visserie',
  unit: 'boîte',
  location: 'Magasin',
  min_qty: 3,
  supplier: 'Quincaillerie Wouri',
  initial_qty: 5,
});
check('création référence (stock initial 5)', ref.status === 201, JSON.stringify(ref.json).slice(0, 160));
const refId = ref.json?.ref?.id;

const out3 = await call('POST', '/api/stock/movements', {
  ref_id: refId,
  move_type: 'out',
  qty: 3,
  beneficiary: 'Atelier B',
});
check('sortie 3 → stock 2', out3.status === 201 && out3.json?.qty === 2, `qty=${out3.json?.qty}`);

const out4 = await call('POST', '/api/stock/movements', {
  ref_id: refId,
  move_type: 'out',
  qty: 4,
  beneficiary: 'Atelier B',
});
check('sortie 4 refusée (stock 2)', out4.status === 409, out4.json?.error);

const corr = await call('POST', '/api/stock/movements', {
  ref_id: refId,
  move_type: 'correction',
  qty: 1,
  note: 'Comptage tiroir 12',
});
check('correction +1 → stock 3', corr.status === 201 && corr.json?.qty === 3, `qty=${corr.json?.qty}`);

const corrNoNote = await call('POST', '/api/stock/movements', {
  ref_id: refId,
  move_type: 'correction',
  qty: 1,
});
check('correction sans motif refusée', corrNoNote.status === 400);

const patchRef = await call('PATCH', `/api/stock/refs/${refId}`, { min_qty: 10 });
check('PATCH seuil min 10', patchRef.status === 200 && patchRef.json?.ref?.min_qty === 10);

// 3. employés
const emp = await call('POST', '/api/employees', { full_name: 'Test PHASE2', job_title: 'Menuisier' });
check('création employé', emp.status === 201 && /^EMP-\d{3}$/.test(emp.json?.employee?.id ?? ''), emp.json?.employee?.id);
const empId = emp.json?.employee?.id;

const badge = await call('POST', `/api/employees/${empId}/badge`);
check('regeneration badge', badge.status === 200 && badge.json?.employee?.badge_token?.startsWith('badge-'));

const deac = await call('PATCH', `/api/employees/${empId}`, { active: false });
check('désactivation employé', deac.status === 200 && deac.json?.employee?.active === false);

// 4. paramètres
const set400 = await call('PUT', '/api/settings', { opening_time: '08:00', closing_time: '07:00' });
check('fermeture avant ouverture refusée', set400.status === 400);
const setOk = await call('PUT', '/api/settings', { tolerance_minutes: 15 });
check('tolérance → 15', setOk.status === 200 && setOk.json?.settings?.tolerance_minutes === 15);
await call('PUT', '/api/settings', { tolerance_minutes: 10 });

// 5. terminaux
const term = await call('POST', '/api/terminals', { name: 'Tablette direction (test)' });
check('création terminal', term.status === 201 && /^TERM-/.test(term.json?.terminal?.id ?? ''), term.json?.terminal?.id);
const termId = term.json?.terminal?.id;
const termOff = await call('PATCH', `/api/terminals/${termId}`, { active: false });
check('désactivation terminal', termOff.status === 200 && termOff.json?.terminal?.active === false);
const kioskTerms = await call('GET', '/api/kiosk/terminals');
check('kiosk n\'affiche que les terminaux actifs', Array.isArray(kioskTerms.json?.terminals) && !kioskTerms.json.terminals.some((t) => t.id === termId));

// 6. comptes
const smokeLogin = `resp.magasin.${Date.now().toString(36)}`;
const user = await call('POST', '/api/users', {
  login: smokeLogin,
  password: 'magasin226',
  display_name: 'Responsable magasin',
  role: 'magasinier',
});
check('création compte', user.status === 201 && user.json?.user?.login === smokeLogin);
const userId = user.json?.user?.id;

check('login nouveau compte', await login(smokeLogin, 'magasin226'));
const forbidden = await call('PUT', '/api/settings', { tolerance_minutes: 5 });
check('magasinier ne peut pas modifier les paramètres', forbidden.status === 403);
const forbiddenUsers = await call('GET', '/api/users');
check('magasinier ne voit pas les comptes', forbiddenUsers.status === 403);

const outIn = await call('POST', '/api/stock/movements', {
  ref_id: refId,
  move_type: 'in',
  qty: 2,
});
check('magasinier peut faire une entrée', outIn.status === 201 && outIn.json?.qty === 5);

const badPw = await call('POST', '/api/users/me/password', {
  current_password: 'faux',
  new_password: 'nouveau226',
});
check('changement mdp avec mdp actuel faux refusé', badPw.status === 401);
const goodPw = await call('POST', '/api/users/me/password', {
  current_password: 'magasin226',
  new_password: 'magasin226bis',
});
check('changement mdp OK', goodPw.status === 200);
check('reconnexion avec le nouveau mdp', await login(smokeLogin, 'magasin226bis'));

check('login direction', await login('direction', 'direction226'));
const dirOut = await call('POST', '/api/stock/movements', {
  ref_id: refId,
  move_type: 'out',
  qty: 1,
  beneficiary: 'Direction',
});
check('direction peut sortir du matériel', dirOut.status === 201);
const dirPatchRef = await call('PATCH', `/api/stock/refs/${refId}`, { location: 'Magasin central' });
check('direction est super-admin (peut modifier les références)', dirPatchRef.status === 200);

check('login chef', await login('chef', 'atelier226'));
const chefIn = await call('POST', '/api/stock/movements', {
  ref_id: refId,
  move_type: 'in',
  qty: 1,
});
check('chef ne peut pas faire d\'entrée', chefIn.status === 403);
const chefOut = await call('POST', '/api/stock/movements', {
  ref_id: refId,
  move_type: 'out',
  qty: 1,
  beneficiary: 'Chantier chapelle',
});
check('chef peut faire une sortie', chefOut.status === 201);

// nettoyage : désactivation compte de test
await login('direction', 'direction226');
await call('PATCH', `/api/users/${userId}`, { active: false });

console.log(failures === 0 ? '\nTous les contrôles sont au vert.' : `\n${failures} contrôle(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
