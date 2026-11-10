import { PGlite } from '@electric-sql/pglite';
import { hashPassword } from '../apps/api/dist/lib/crypto.js';
import { PERMISSION_ACTIONS } from '../apps/api/dist/lib/permissions.js';

async function main() {
  const targetDirs = ['apps/api/data/pglite', 'data/pglite'];

  for (const dir of targetDirs) {
    console.log(`[setup-super-observers] Synchronisation de la base : ${dir}...`);
    const db = new PGlite(dir);

    // 1. Inscrire le rôle système 'observateur'
    await db.query(`
      INSERT INTO roles (id, name, description, is_system) VALUES
        ('observateur', 'Observateur Passif (Haute Autorité)', 'Consultation intégrale du système, de tous les modules et indicateurs financiers en lecture seule, sans droit de modification.', true)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        is_system = true;
    `);

    // 2. Définir les permissions de l'observateur
    const VIEW_AND_SELF_ACTIONS = [
      'dashboard.view',
      'projects.view',
      'tools.view',
      'loans.view',
      'magasins.view',
      'stock.view',
      'attendance.view',
      'leaves.view',
      'employees.view',
      'financial.view',
      'reports.view',
      'reports.export',
      'settings.view',
      'users.view',
      'profile.photo_edit_self',
      'profile.login_edit',
    ];

    for (const action of PERMISSION_ACTIONS) {
      const allowed = VIEW_AND_SELF_ACTIONS.includes(action);
      await db.query(`
        INSERT INTO role_permissions (role, action, allowed)
        VALUES ('observateur', $1, $2)
        ON CONFLICT (role, action) DO UPDATE SET allowed = EXCLUDED.allowed;
      `, [action, allowed]);
    }

    // 3. Création des deux super profils d'observateurs passifs
    const prieurPass = hashPassword('prieur2026');
    const abbePass = hashPassword('abbemeyer2026');

    // Père Nicolas (Prieur du monastère)
    await db.query(`
      INSERT INTO users (login, password_hash, display_name, role, employee_id, active)
      VALUES ('prieur', $1, 'Père Nicolas (Prieur)', 'observateur', NULL, true)
      ON CONFLICT (login) DO UPDATE SET
        role = 'observateur',
        display_name = 'Père Nicolas (Prieur)',
        password_hash = $1,
        employee_id = NULL,
        active = true;
    `, [prieurPass]);

    // Père Abbé Christian Meyer (en Suisse)
    await db.query(`
      INSERT INTO users (login, password_hash, display_name, role, employee_id, active)
      VALUES ('abbe.meyer', $1, 'Père Abbé Christian Meyer (Suisse)', 'observateur', NULL, true)
      ON CONFLICT (login) DO UPDATE SET
        role = 'observateur',
        display_name = 'Père Abbé Christian Meyer (Suisse)',
        password_hash = $1,
        employee_id = NULL,
        active = true;
    `, [abbePass]);

    // Marquer la révision dans _migrations
    await db.query(`
      INSERT INTO _migrations (name) VALUES ('023_super_observateurs_passifs_v1')
      ON CONFLICT DO NOTHING;
    `);

    await db.close();
    console.log(`[setup-super-observers] ✅ Base synchronisée : ${dir}`);
  }

  console.log('\n======================================================');
  console.log('✅ COMPTES DE HAUTE AUTORITÉ CRÉÉS AVEC SUCCÈS :');
  console.log('------------------------------------------------------');
  console.log('1. PÈRE NICOLAS (Prieur du Monastère)');
  console.log('   - Identifiant : prieur');
  console.log('   - Mot de passe : prieur2026');
  console.log('   - Rôle : observateur (Observateur Passif · Haute Autorité)');
  console.log('   - Privilèges : Consultation intégrale (Dashboard, Projets,');
  console.log('                  Outils, Stocks, Magasins, Présences, Employés,');
  console.log('                  Finances, Rapports, Paramètres)');
  console.log('   - Modifications : Strictement interdites partout, sauf sur');
  console.log('                     ses paramètres de compte (photo, login, nom, mot de passe).');
  console.log('------------------------------------------------------');
  console.log('2. PÈRE ABBÉ CHRISTIAN MEYER (en Suisse)');
  console.log('   - Identifiant : abbe.meyer');
  console.log('   - Mot de passe : abbemeyer2026');
  console.log('   - Rôle : observateur (Observateur Passif · Haute Autorité)');
  console.log('   - Privilèges : Idem (consultation intégrale à distance)');
  console.log('   - Modifications : Strictement interdites partout, sauf sur');
  console.log('                     ses paramètres de compte.');
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('[setup-super-observers] Erreur :', err);
  process.exit(1);
});
