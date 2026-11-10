import { app } from '../apps/api/dist/app.js';

async function runTests() {
  console.log('--- DÉBUT DE LA VÉRIFICATION EXPERTE DES SUPER PROFILS OBSERVATEURS PASSIFS ---\n');

  // Helper pour simuler des requêtes HTTP sur l'application Hono
  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
      options.body = JSON.stringify(options.body);
    }
    const res = await app.request(`http://localhost${path}`, {
      ...options,
      headers,
    });
    let data = null;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, headers: res.headers, data };
  }

  // 1. Authentification Père Nicolas
  console.log('1. TEST : Connexion de Père Nicolas (@prieur)');
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    body: { login: 'prieur', password: 'prieur2026' },
  });
  if (loginRes.status !== 200) {
    throw new Error(`Échec connexion prieur: status ${loginRes.status} ${JSON.stringify(loginRes.data)}`);
  }
  console.log('   ✅ Connexion réussie :', loginRes.data.user.display_name, '· Rôle :', loginRes.data.user.role);

  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0];
  const authHeaders = { Cookie: cookie };

  // 2. Vérification des permissions
  console.log('\n2. TEST : Vérification de la matrice de permissions (/api/permissions/me)');
  const permsRes = await request('/api/permissions/me', { headers: authHeaders });
  if (permsRes.status !== 200) {
    throw new Error(`Échec /api/permissions/me: status ${permsRes.status}`);
  }
  const perms = permsRes.data.permissions;
  console.log('   superAdmin flag :', permsRes.data.superAdmin, '(doit être FALSE pour appliquer les verrous stricts)');
  if (permsRes.data.superAdmin !== false) throw new Error('superAdmin doit être false');

  const requiredViews = [
    'dashboard.view', 'projects.view', 'tools.view', 'loans.view',
    'magasins.view', 'stock.view', 'attendance.view', 'leaves.view',
    'employees.view', 'financial.view', 'reports.view', 'reports.export',
    'settings.view', 'users.view', 'profile.photo_edit_self', 'profile.login_edit'
  ];
  for (const v of requiredViews) {
    if (!perms[v]) throw new Error(`Permission attendue manquante: ${v}`);
  }
  console.log('   ✅ Toutes les 16 permissions de consultation et d’auto-gestion sont ACCORDÉES.');

  const forbiddenActions = [
    'tools.create', 'tools.edit', 'tools.delete', 'tools.edit_status', 'tools.photo_edit',
    'loans.create', 'loans.return', 'magasins.manage', 'stock.create_ref', 'stock.edit_ref',
    'stock.delete_ref', 'stock.photo_edit', 'stock.move', 'stock.correct', 'attendance.correct',
    'leaves.manage', 'employees.create', 'employees.edit', 'employees.photo_edit', 'employees.print_badge',
    'projects.create', 'projects.edit', 'projects.delete', 'settings.edit', 'users.manage',
    'permissions.manage', 'terminals.manage', 'terminals.access', 'scanner.use'
  ];
  for (const a of forbiddenActions) {
    if (perms[a]) throw new Error(`Action interdite accordée à tort: ${a}`);
  }
  console.log('   ✅ Toutes les 29 actions de modification opérationnelle sont STRICTEMENT REFUSÉES.');

  // 3. Test de consultation intégrale de TOUS les modules
  console.log('\n3. TEST : Consultation intégrale de TOUTES les interfaces (Lecture)');
  const consultationEndpoints = [
    { name: 'Tableau de bord', path: '/api/dashboard' },
    { name: 'Commandes & Chantiers', path: '/api/projects' },
    { name: 'Matériel & Machines', path: '/api/tools' },
    { name: 'Prêts d’outils', path: '/api/loans' },
    { name: 'Stock & Quincaillerie', path: '/api/stock/refs' },
    { name: 'Mouvements de stock', path: '/api/stock/movements' },
    { name: 'Magasins', path: '/api/magasins' },
    { name: 'Fiches Travailleurs', path: '/api/employees' },
    { name: 'Pointages', path: '/api/attendance' },
    { name: 'Congés & Permissions', path: '/api/leaves' },
    { name: 'Paramètres du système', path: '/api/settings' },
    { name: 'Liste des comptes utilisateurs', path: '/api/users' },
    { name: 'Matrice des rôles & permissions', path: '/api/permissions' },
    { name: 'Terminaux enregistrés', path: '/api/terminals' },
  ];

  for (const ep of consultationEndpoints) {
    const res = await request(ep.path, { headers: authHeaders });
    if (res.status !== 200) {
      throw new Error(`Échec consultation ${ep.name} (${ep.path}): status ${res.status} ${JSON.stringify(res.data)}`);
    }
    console.log(`   ✅ [200 OK] ${ep.name} (${ep.path})`);
  }

  // 4. Test des blocages stricts de modification (Toutes les mutations doivent renvoyer 403 Forbidden)
  console.log('\n4. TEST : Tentatives de modification interdites (Doivent être REJETÉES en 403 Forbidden)');
  const mutationAttempts = [
    { name: 'Création d’un outil', method: 'POST', path: '/api/tools', body: { id: 'TEST-999', name: 'Test', category: 'Test', location: 'Atelier' } },
    { name: 'Modification d’un outil', method: 'PATCH', path: '/api/tools/RBT-001', body: { name: 'Piratage' } },
    { name: 'Suppression d’un outil', method: 'DELETE', path: '/api/tools/RBT-001' },
    { name: 'Enregistrement d’un prêt', method: 'POST', path: '/api/loans', body: { tool_id: 'RBT-001', employee_id: 'EMP-001' } },
    { name: 'Création d’une référence de stock', method: 'POST', path: '/api/stock/refs', body: { name: 'Test Stock', category: 'Vis', unit: 'u', min_qty: 10, initial_qty: 0 } },
    { name: 'Mouvement de stock', method: 'POST', path: '/api/stock/movements', body: { ref_id: 1, move_type: 'out', qty: 1 } },
    { name: 'Création d’un magasin', method: 'POST', path: '/api/magasins', body: { id: 'MAG-999', name: 'Faux magasin', code: 'MAG-TEST' } },
    { name: 'Création d’un travailleur', method: 'POST', path: '/api/employees', body: { id: 'EMP-999', full_name: 'Faux Ouvrier', job_title: 'Test' } },
    { name: 'Correction de pointage', method: 'PATCH', path: '/api/attendance/correction', body: { employee_id: 'EMP-001', punch_date: '2026-11-10', punch_type: 'in', new_time: '08:00' } },
    { name: 'Création d’un projet', method: 'POST', path: '/api/projects', body: { title: 'Faux projet' } },
    { name: 'Modification des horaires globaux', method: 'PUT', path: '/api/settings', body: { opening_time: '06:00' } },
    { name: 'Création d’un compte utilisateur', method: 'POST', path: '/api/users', body: { login: 'hacker', password: 'password', display_name: 'Hacker', role: 'direction' } },
    { name: 'Modification des permissions du système', method: 'PUT', path: '/api/permissions', body: { matrix: {} } },
  ];

  for (const m of mutationAttempts) {
    const res = await request(m.path, { method: m.method, headers: authHeaders, body: m.body });
    if (res.status !== 403) {
      throw new Error(`FAILLE DE SÉCURITÉ : ${m.name} (${m.method} ${m.path}) a renvoyé ${res.status} au lieu de 403 Forbidden!`);
    }
    console.log(`   🔒 [403 Interdit] ${m.name} correctement bloqué : ${res.data?.error || 'Droit insuffisant'}`);
  }

  // 5. Test des droits d'auto-gestion sur son PROPRE profil (Mon Espace)
  console.log('\n5. TEST : Auto-gestion autorisée dans son propre espace (/api/auth/profile)');
  
  // A. Modification de son nom affiché
  const updateNameRes = await request('/api/auth/profile', {
    method: 'PATCH',
    headers: authHeaders,
    body: { display_name: 'Très Révérend Père Nicolas (Prieur)' },
  });
  if (updateNameRes.status !== 200 || updateNameRes.data.user.display_name !== 'Très Révérend Père Nicolas (Prieur)') {
    throw new Error(`Échec mise à jour nom affiché: ${JSON.stringify(updateNameRes.data)}`);
  }
  console.log('   ✅ [200 OK] Modification du nom affiché réussie :', updateNameRes.data.user.display_name);

  // B. Modification de son avatar / photo de profil
  const updatePhotoRes = await request('/api/auth/profile/photo', {
    method: 'POST',
    headers: authHeaders,
    body: { photo_path: '/photos/prieur-nicolas.jpg' },
  });
  if (updatePhotoRes.status !== 200 || updatePhotoRes.data.photo_path !== '/photos/prieur-nicolas.jpg') {
    throw new Error(`Échec mise à jour photo: ${JSON.stringify(updatePhotoRes.data)}`);
  }
  console.log('   ✅ [200 OK] Modification de la photo de profil réussie :', updatePhotoRes.data.photo_path);

  // C. Modification de son mot de passe
  const updatePassRes = await request('/api/auth/profile', {
    method: 'PATCH',
    headers: authHeaders,
    body: { current_password: 'prieur2026', new_password: 'NouveauPrieur2026!' },
  });
  if (updatePassRes.status !== 200) {
    throw new Error(`Échec changement mot de passe: ${JSON.stringify(updatePassRes.data)}`);
  }
  console.log('   ✅ [200 OK] Modification du mot de passe personnel réussie.');

  // Vérification de la connexion avec le nouveau mot de passe
  const reLoginRes = await request('/api/auth/login', {
    method: 'POST',
    body: { login: 'prieur', password: 'NouveauPrieur2026!' },
  });
  if (reLoginRes.status !== 200) {
    throw new Error('Échec connexion avec le nouveau mot de passe');
  }
  console.log('   ✅ [200 OK] Connexion validée avec le nouveau mot de passe.');

  // Rétablir le mot de passe initial propre pour l'utilisateur
  const cookie2 = reLoginRes.headers.get('set-cookie')?.split(';')[0];
  await request('/api/auth/profile', {
    method: 'PATCH',
    headers: { Cookie: cookie2 },
    body: {
      current_password: 'NouveauPrieur2026!',
      new_password: 'prieur2026',
      display_name: 'Père Nicolas (Prieur)',
      photo_path: null,
    },
  });
  console.log('   ✅ Réinitialisation au mot de passe initial "prieur2026" effectuée pour la remise au client.');

  // 6. Test du deuxième compte : Père Abbé Christian Meyer (en Suisse)
  console.log('\n6. TEST : Connexion et vérification du Père Abbé Christian Meyer (@abbe.meyer)');
  const abbeLoginRes = await request('/api/auth/login', {
    method: 'POST',
    body: { login: 'abbe.meyer', password: 'abbemeyer2026' },
  });
  if (abbeLoginRes.status !== 200) {
    throw new Error(`Échec connexion abbe.meyer: status ${abbeLoginRes.status} ${JSON.stringify(abbeLoginRes.data)}`);
  }
  console.log('   ✅ Connexion réussie :', abbeLoginRes.data.user.display_name, '· Rôle :', abbeLoginRes.data.user.role);

  const abbeCookie = abbeLoginRes.headers.get('set-cookie')?.split(';')[0];
  const abbeHeaders = { Cookie: abbeCookie };

  const abbeDashboard = await request('/api/dashboard', { headers: abbeHeaders });
  if (abbeDashboard.status !== 200) {
    throw new Error('Échec consultation dashboard pour le Père Abbé');
  }
  console.log('   ✅ [200 OK] Accès complet au tableau de bord pour le Père Abbé.');

  const abbeMutation = await request('/api/tools', {
    method: 'POST',
    headers: abbeHeaders,
    body: { id: 'TOOL-FAIL', name: 'Test' },
  });
  if (abbeMutation.status !== 403) {
    throw new Error('La tentative de modification du Père Abbé n’a pas été rejetée en 403');
  }
  console.log('   🔒 [403 Interdit] Écriture opérationnelle également strictement interdite au Père Abbé.');

  console.log('\n================================================================');
  console.log('🎉 TOUS LES TESTS SONT PASSÉS AVEC UN SUCCÈS TOTAL ET SANS FAILLE !');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ ÉCHEC DU TEST :', err);
  process.exit(1);
});
