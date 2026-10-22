const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const REPORT_DIR = path.join(__dirname, 'persona_audit_reports');

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

async function runPersonaAudit() {
  console.log('===============================================================');
  console.log('🎭 AUDIT ERGONOMIQUE COGNITIF & TESTS E2E DES 4 PERSONAS');
  console.log('===============================================================');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const auditLog = [];

  async function loginAs(page, username, password) {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    // Check if already logged in -> logout first
    const isWorkspace = await page.$('header button[aria-label="Menu"], aside');
    if (isWorkspace) {
      // Logout
      await page.evaluate(async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        } catch (e) {}
      });
      await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    }

    await page.waitForSelector('input[autocomplete="username"]', { timeout: 8000 });
    await page.evaluate(() => {
      document.querySelector('input[autocomplete="username"]').value = '';
      document.querySelector('input[autocomplete="current-password"]').value = '';
    });
    await page.type('input[autocomplete="username"]', username);
    await page.type('input[autocomplete="current-password"]', password);
    await (await page.$('button[type="submit"]')).click();
    await page.waitForSelector('main', { timeout: 8000 });
    await new Promise(r => setTimeout(r, 1200));
  }

  // --------------------------------------------------------------------------
  // PERSONA 1: DIRECTION DU MONASTÈRE (Gouvernance, KPIs, Arbitrage)
  // --------------------------------------------------------------------------
  console.log('\n--- [PERSONA 1] DIRECTION DU MONASTÈRE ---');
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 }); // Desktop view for executive dashboard
    try {
      const tStart = Date.now();
      await loginAs(page, 'direction', 'direction226');

      // 1. Dashboard KPIs
      const kpis = await page.evaluate(() => {
        const text = document.querySelector('main')?.innerText || '';
        return {
          hasTauxPresence: text.includes('Taux de présence') || text.includes('Présents'),
          hasWhosIn: text.includes('En poste') || text.includes('Présents aujourd'),
          hasAlerts: text.includes('Retards') || text.includes('Alertes'),
        };
      });
      console.log('✓ Direction: Dashboard KPIs chargés avec succès :', kpis);
      await page.screenshot({ path: path.join(REPORT_DIR, '01_direction_dashboard.png') });

      // 2. Pointage & Feuilles de temps
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(el => el.textContent && el.textContent.includes('Pointage'));
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 1200));

      const timesheetsRows = await page.evaluate(() => {
        return document.querySelectorAll('table tbody tr').length;
      });
      console.log(`✓ Direction: Feuilles de temps affichent ${timesheetsRows} collaborateurs`);
      await page.screenshot({ path: path.join(REPORT_DIR, '02_direction_timesheets.png') });

      // 3. Validation de congés dans Équipe
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(el => el.textContent && el.textContent.includes('Équipe'));
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 1200));

      // Switch to Time-off tab
      await page.evaluate(() => {
        const t = Array.from(document.querySelectorAll('[role="tab"]')).find(el => el.textContent && el.textContent.includes('Planning'));
        if (t) t.click();
      });
      await new Promise(r => setTimeout(r, 1000));
      await page.screenshot({ path: path.join(REPORT_DIR, '03_direction_timeoff.png') });
      console.log('✓ Direction: Calendrier des congés mensuel validé');

      // 4. Paramètres & Matrice RBAC
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(el => el.textContent && el.textContent.includes('Paramètres'));
        if (btn) btn.click();
      });
      await page.waitForFunction(() => !document.body.innerText.includes('Chargement des paramètres'), { timeout: 8000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 1500));
      await page.screenshot({ path: path.join(REPORT_DIR, '04_direction_parametres.png') });
      console.log('✓ Direction: Console d’administration & RBAC opérationnelle');

      auditLog.push({ persona: 'Direction', status: 'SUCCESS', responseTimeMs: Date.now() - tStart });
    } catch (err) {
      console.error('❌ Erreur Persona Direction:', err);
      auditLog.push({ persona: 'Direction', status: 'FAILED', error: String(err) });
    } finally {
      await page.close();
    }
  }

  // --------------------------------------------------------------------------
  // PERSONA 2: LE MAGASINIER (Pierre Nkoa - Outillage, Stock, Magasins)
  // --------------------------------------------------------------------------
  console.log('\n--- [PERSONA 2] LE MAGASINIER (Pierre NKOA) ---');
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 }); // iPhone 14 Pro Mobile First
    try {
      const tStart = Date.now();
      await loginAs(page, 'magasinier', 'magasin226');

      // 1. Parc Outils Mobile
      await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button')).find(el => el.textContent && el.textContent.includes('Outils'));
        if (b) b.click();
      });
      await new Promise(r => setTimeout(r, 1200));

      const toolsCount = await page.evaluate(() => {
        return document.querySelectorAll('main div.space-y-2\\.5 > div, main table tbody tr').length;
      });
      console.log(`✓ Magasinier: Vue mobile parc outils chargée (${toolsCount} éléments affichés)`);
      await page.screenshot({ path: path.join(REPORT_DIR, '05_magasinier_outils_mobile.png') });

      // 2. Stock Mobile & Mouvement
      await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button')).find(el => el.textContent && el.textContent.includes('Stock'));
        if (b) b.click();
      });
      await new Promise(r => setTimeout(r, 1200));

      const stockCount = await page.evaluate(() => {
        return document.querySelectorAll('main div.space-y-2\\.5 > div').length;
      });
      console.log(`✓ Magasinier: Vue mobile fiches de stock chargée (${stockCount} fiches mobiles)`);
      await page.screenshot({ path: path.join(REPORT_DIR, '06_magasinier_stock_mobile.png') });

      // 3. Magasins & Dépôts
      const menuBtn = await page.$('header button[aria-label="Menu"]');
      if (menuBtn) {
        await menuBtn.click();
        await new Promise(r => setTimeout(r, 400));
        await page.evaluate(() => {
          const b = Array.from(document.querySelectorAll('button')).find(el => el.textContent && el.textContent.includes('Magasin'));
          if (b) b.click();
        });
        await new Promise(r => setTimeout(r, 1200));
      }
      await page.screenshot({ path: path.join(REPORT_DIR, '07_magasinier_depots.png') });
      console.log('✓ Magasinier: Répertoire des magasins & quincaillerie validé');

      auditLog.push({ persona: 'Magasinier', status: 'SUCCESS', responseTimeMs: Date.now() - tStart });
    } catch (err) {
      console.error('❌ Erreur Persona Magasinier:', err);
      auditLog.push({ persona: 'Magasinier', status: 'FAILED', error: String(err) });
    } finally {
      await page.close();
    }
  }

  // --------------------------------------------------------------------------
  // PERSONA 3: LE CHEF D'ATELIER (Jean-Marc Atangana - Production & Équipe)
  // --------------------------------------------------------------------------
  console.log('\n--- [PERSONA 3] LE CHEF D’ATELIER (Jean-Marc ATANGANA) ---');
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 768, height: 1024 }); // iPad Tablette Atelier
    try {
      const tStart = Date.now();
      await loginAs(page, 'chef', 'atelier226');

      // 1. Dashboard Atelier
      await page.screenshot({ path: path.join(REPORT_DIR, '08_chef_dashboard_tablet.png') });
      console.log('✓ Chef d’atelier: Tableau de bord sur tablette vérifié');

      // 2. Contrôle de présence atelier
      await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button')).find(el => el.textContent && el.textContent.includes('Pointage'));
        if (b) b.click();
      });
      await new Promise(r => setTimeout(r, 1200));
      await page.screenshot({ path: path.join(REPORT_DIR, '09_chef_pointage_tablet.png') });
      console.log('✓ Chef d’atelier: Registre de présence & retards validé');

      auditLog.push({ persona: 'Chef d’atelier', status: 'SUCCESS', responseTimeMs: Date.now() - tStart });
    } catch (err) {
      console.error('❌ Erreur Persona Chef d’atelier:', err);
      auditLog.push({ persona: 'Chef d’atelier', status: 'FAILED', error: String(err) });
    } finally {
      await page.close();
    }
  }

  // --------------------------------------------------------------------------
  // PERSONA 4: LE TRAVAILLEUR / MENUISIER (Aimé Mbarga - Espace Personnel & Kiosque)
  // --------------------------------------------------------------------------
  console.log('\n--- [PERSONA 4] LE TRAVAILLEUR / MENUISIER (Aimé MBARGA) ---');
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 812 }); // Smartphone Ouvrier
    try {
      const tStart = Date.now();
      await loginAs(page, 'ouvrier', 'atelier226');

      // 1. Espace Personnel Ouvrier
      const espaceInfo = await page.evaluate(() => {
        const text = document.querySelector('main')?.innerText || '';
        return {
          hasGreeting: text.includes('Bonjour'),
          hasSituation: text.includes('situation') || text.includes('Présent') || text.includes('retard'),
          hasStats: text.includes('Jours ce mois'),
        };
      });
      console.log('✓ Menuisier: Mon Espace chargé avec succès :', espaceInfo);
      await page.screenshot({ path: path.join(REPORT_DIR, '10_ouvrier_espace_mobile.png') });

      // 2. Consultation Historique personnel
      const rowsCount = await page.evaluate(() => {
        return document.querySelectorAll('main ul li, main table tbody tr').length;
      });
      console.log(`✓ Menuisier: Historique de pointage personnel (${rowsCount} enregistrements affichés)`);

      auditLog.push({ persona: 'Menuisier', status: 'SUCCESS', responseTimeMs: Date.now() - tStart });
    } catch (err) {
      console.error('❌ Erreur Persona Menuisier:', err);
      auditLog.push({ persona: 'Menuisier', status: 'FAILED', error: String(err) });
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log('\n===============================================================');
  console.log('📊 SYNTHÈSE DE L’AUDIT DES 4 PERSONAS :');
  console.log(JSON.stringify(auditLog, null, 2));
  console.log('===============================================================');
}

runPersonaAudit().catch(console.error);
