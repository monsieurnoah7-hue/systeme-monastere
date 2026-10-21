import puppeteer from 'puppeteer-core';
import { PERSONAS } from './personas.mjs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:5173';
const API = 'http://127.0.0.1:8787';
const issues = [];
let shotN = 0;

function log(sev, persona, ctx, msg, extra = {}) {
  const entry = { sev, persona, ctx, msg, ...extra };
  issues.push(entry);
  const icon = sev === 'error' ? '✗' : sev === 'warn' ? '⚠' : sev === 'info' ? '·' : '✓';
  console.log(`${icon} [${persona}] ${ctx}: ${msg}`);
}

async function shoot(page, name) {
  shotN++;
  const p = `${process.env.TEMP}\\shots\\audit-${String(shotN).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

async function login(page, persona) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 25000 });
  // attendre que React rende le formulaire (input login + password)
  await page.waitForFunction(() => {
    const inputs = document.querySelectorAll('input');
    return inputs.length >= 2;
  }, { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 500));
  // find inputs by type
  const inputs = await page.$$('input');
  // login = first text-ish, password = password type
  let loginSel = inputs[0], passSel = inputs[0];
  for (const inp of inputs) {
    const t = await inp.evaluate((e) => e.type);
    if (t === 'password') passSel = inp;
    else if (!loginSel || loginSel === passSel) loginSel = inp;
  }
  await loginSel.click({ clickCount: 3 });
  await loginSel.type(persona.login);
  await passSel.click({ clickCount: 3 });
  await passSel.type(persona.password);
  // click submit button
  const btns = await page.$$('button');
  for (const b of btns) {
    const txt = (await b.evaluate((e) => e.textContent)) || '';
    if (/se connecter|connexion|entrer/i.test(txt)) { await b.click(); break; }
  }
  await page.waitForFunction(() => !document.body.innerText.includes('Se connecter'), { timeout: 15000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));
}

async function nav(page, viewId) {
  // sidebar buttons have data or text; click by matching nav label
  const labels = {
    dashboard: 'Tableau de bord', outils: 'Outils', magasins: 'Magasins', pointage: 'Pointage',
    stock: 'Stock', employes: 'Travailleurs', espace: 'Mon espace', parametres: 'Paramètres',
  };
  const target = labels[viewId] || viewId;
  const clicked = await page.evaluate((t) => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => (x.textContent || '').trim().startsWith(t));
    if (b) { b.click(); return true; }
    return false;
  }, target);
  await new Promise((r) => setTimeout(r, 900));
  return clicked;
}

async function collectErrors(page, persona, ctx) {
  const errs = [];
  page.removeAllListeners('console');
  page.on('console', (msg) => {
    if (msg.type() === 'error') errs.push(msg.text());
  });
  page.removeAllListeners('requestfailed');
  page.on('requestfailed', (req) => {
    if (req.url().includes('/api/')) errs.push(`REQ FAIL ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
  });
  page.removeAllListeners('response');
  page.on('response', (res) => {
    if (res.url().includes('/api/') && res.status() >= 400 && res.status() < 500) {
      errs.push(`HTTP ${res.status()} ${res.url().replace(BASE, '')}`);
    }
  });
  return errs;
}

async function checkVisibleText(page, patterns, persona, ctx) {
  const text = await page.evaluate(() => document.body.innerText);
  for (const p of patterns) {
    if (p.not && new RegExp(p.not, 'i').test(text)) log('error', persona, ctx, `Texte interdit présent: ${p.not}`);
    if (p.must && !new RegExp(p.must, 'i').test(text)) log('warn', persona, ctx, `Texte attendu manquant: ${p.must}`);
  }
}

async function apiFlow(page, persona, ctx, steps) {
  // run raw fetches via page context (shares cookies)
  for (const step of steps) {
    try {
      const res = await page.evaluate(async ({ method, path, body }) => {
        const r = await fetch(path, {
          method,
          credentials: 'include',
          headers: body ? { 'Content-Type': 'application/json' } : {},
          body: body ? JSON.stringify(body) : undefined,
        });
        const t = await r.text();
        return { status: r.status, body: t ? JSON.parse(t) : null };
      }, step);
      const ok = step.expect ? res.status === step.expect : res.status < 400;
      if (ok) log('pass', persona, ctx, `${step.method} ${step.path} → ${res.status}`);
      else log('error', persona, ctx, `${step.method} ${step.path} → ${res.status} (attendu ${step.expect ?? '<400'}) ${JSON.stringify(res.body)?.slice(0, 200)}`);
    } catch (e) {
      log('error', persona, ctx, `Exception ${step.method} ${step.path}: ${e.message}`);
    }
  }
}

async function testPersona(browser, persona) {
  console.log(`\n${'='.repeat(60)}\nPERSONA: ${persona.name} (${persona.role})\n${'='.repeat(60)}`);
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errs.push(msg.text());
  });
  page.on('requestfailed', (req) => {
    if (req.url().includes('/api/')) errs.push(`REQ FAIL ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
  });
  page.on('response', (res) => {
    if (res.url().includes('/api/') && res.status() >= 400 && res.status() < 500) {
      errs.push(`HTTP ${res.status()} ${res.url().replace(BASE, '')}`);
    }
  });

  // 1. Login (avec 2 tentatives)
  let loggedIn = false;
  for (let attempt = 1; attempt <= 2 && !loggedIn; attempt++) {
    try {
      await login(page, persona);
      loggedIn = true;
      log('pass', persona.id, 'login', `Connexion réussie (${persona.login})${attempt > 1 ? ' (2e tentative)' : ''}`);
    } catch (e) {
      if (attempt === 2) {
        log('error', persona.id, 'login', `Échec connexion après 2 tentatives: ${e.message}`);
        await context.close();
        return;
      }
      log('warn', persona.id, 'login', `Tentative ${attempt} échouée, retry…`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  await shoot(page, `${persona.id}-home`);

  // 2. Visit each allowed screen
  for (const view of persona.screens) {
    const ok = await nav(page, view);
    if (!ok) { log('warn', persona.id, view, 'Bouton de navigation introuvable'); continue; }
    await new Promise((r) => setTimeout(r, 600));
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('Erreur') || bodyText.includes('introuvable') || bodyText.includes('Impossible')) {
      log('warn', persona.id, view, 'Texte d’erreur détecté à l’écran', { snippet: bodyText.slice(0, 200) });
    }
    if (bodyText.trim().length < 50) log('warn', persona.id, view, 'Écran quasi vide');
    log('pass', persona.id, view, 'Navigation OK');
    await shoot(page, `${persona.id}-${view}`);
  }

  // 3. API flows per persona
  if (persona.id === 'direction') {
    await apiFlow(page, persona.id, 'api-magasins', [
      { method: 'GET', path: '/api/magasins', expect: 200 },
      { method: 'GET', path: '/api/permissions', expect: 200 },
      { method: 'GET', path: '/api/permissions/me', expect: 200 },
      { method: 'GET', path: '/api/employees/today-status', expect: 200 },
      { method: 'GET', path: '/api/leaves', expect: 200 },
      { method: 'GET', path: '/api/leaves?status=pending', expect: 200 },
      { method: 'GET', path: '/api/dashboard', expect: 200 },
      { method: 'GET', path: '/api/scan?q=RBT-001', expect: 200 },
      { method: 'GET', path: '/api/scan?q=H4K7M', expect: 200 },
    ]);
    // récupérer l'ID réel d'une demande pending puis la traiter
    const pendingList = await page.evaluate(async () => {
      const r = await fetch('/api/leaves?status=pending', { credentials: 'include' });
      return r.json();
    });
    const pendingId = pendingList?.leaves?.[0]?.id;
    if (pendingId) {
      await apiFlow(page, persona.id, 'api-leaves-review', [
        { method: 'PATCH', path: `/api/leaves/${pendingId}/review`, body: { status: 'approved' }, expect: 200 },
        { method: 'PATCH', path: `/api/leaves/${pendingId}/review`, body: { status: 'approved' }, expect: 409 },
      ]);
    } else {
      log('warn', persona.id, 'api-leaves-review', 'Aucune demande en attente à tester');
    }
    // correction présence (direction peut)
    await apiFlow(page, persona.id, 'api-attendance', [
      { method: 'GET', path: '/api/employees/EMP-001/detail', expect: 200 },
    ]);
  }

  if (persona.id === 'direction') {
    await apiFlow(page, persona.id, 'api-admin', [
      { method: 'GET', path: '/api/users', expect: 200 },
      { method: 'GET', path: '/api/terminals', expect: 200 },
      { method: 'GET', path: '/api/settings', expect: 200 },
      { method: 'GET', path: '/api/permissions', expect: 200 },
      { method: 'PUT', path: '/api/permissions', body: { matrix: {} }, expect: 200 },
      { method: 'POST', path: '/api/magasins', body: { name: 'Magasin Test', code: 'TST', description: 'audit' }, expect: 201 },
      { method: 'PATCH', path: '/api/magasins/MAG-001', body: { description: 'mis à jour audit' }, expect: 200 },
    ]);
  }

  if (persona.id === 'chef') {
    await apiFlow(page, persona.id, 'api-chef', [
      { method: 'GET', path: '/api/tools', expect: 200 },
      { method: 'GET', path: '/api/loans?status=out', expect: 200 },
      { method: 'GET', path: '/api/stock/refs', expect: 200 },
      { method: 'GET', path: '/api/magasins', expect: 200 },
      { method: 'GET', path: '/api/employees/today-status', expect: 200 },
      { method: 'GET', path: '/api/dashboard', expect: 200 },
      // chef ne peut PAS créer d'outil
      { method: 'POST', path: '/api/tools', body: { name: 'Test chef', category: 'Divers' }, expect: 403 },
      // chef ne peut PAS créer de magasin
      { method: 'POST', path: '/api/magasins', body: { name: 'X', code: 'X' }, expect: 403 },
      // chef peut faire une sortie stock (ref 3 = Tasseaux, 180 m dispo)
      { method: 'POST', path: '/api/stock/movements', body: { ref_id: 3, move_type: 'out', qty: 1, beneficiary: 'Chantier test' }, expect: 201 },
      // chef ne peut PAS faire d'entrée
      { method: 'POST', path: '/api/stock/movements', body: { ref_id: 3, move_type: 'in', qty: 1 }, expect: 403 },
    ]);
  }

  if (persona.id === 'travailleur') {
    await apiFlow(page, persona.id, 'api-travailleur', [
      { method: 'GET', path: '/api/me/overview', expect: 200 },
      { method: 'GET', path: '/api/me/catalog', expect: 200 },
      { method: 'GET', path: '/api/leaves/mine', expect: 200 },
      // travailleur ne doit PAS voir la liste des outils (requireRole sans travailleur)
      { method: 'GET', path: '/api/tools', expect: 403 },
      { method: 'GET', path: '/api/employees', expect: 403 },
      { method: 'GET', path: '/api/stock/refs', expect: 403 },
      { method: 'GET', path: '/api/dashboard', expect: 403 },
      // travailleur peut voir son détail via /me
      { method: 'GET', path: '/api/employees/EMP-003/detail', expect: 403 }, // bien protégé
    ]);
    // vérifier que /me/overview renvoie bien les données d'Aimé
    const ov = await page.evaluate(async () => {
      const r = await fetch('/api/me/overview', { credentials: 'include' });
      return r.json();
    });
    if (ov.employee?.id === 'EMP-003') log('pass', persona.id, 'api-me', 'Overview = bon employé (EMP-003)');
    else log('error', persona.id, 'api-me', `Overview = mauvais employé: ${ov.employee?.id}`);
    if (Array.isArray(ov.openLoans) && ov.openLoans.length > 0) log('pass', persona.id, 'api-me', `OpenLoans: ${ov.openLoans.length} outil(s) en prêt`);
    else log('warn', persona.id, 'api-me', `OpenLoans: ${ov.openLoans?.length ?? 'null'}`);
  }

  // 4. UI interactions communes : ouvrir un drawer outil
  if (persona.screens.includes('outils')) {
    await nav(page, 'outils');
    await new Promise((r) => setTimeout(r, 700));
    // cliquer la première ligne du tableau
    const clicked = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('tbody tr')];
      if (rows.length) { rows[0].click(); return true; }
      return false;
    });
    await new Promise((r) => setTimeout(r, 800));
    if (clicked) {
      const drawerText = await page.evaluate(() => document.body.innerText);
      if (drawerText.includes('Fiche') || drawerText.includes('QR code') || drawerText.includes('Historique')) {
        log('pass', persona.id, 'outils-drawer', 'Drawer fiche outil ouvert');
      } else {
        log('warn', persona.id, 'outils-drawer', 'Drawer semble ne pas s’ouvrir');
      }
      await shoot(page, `${persona.id}-outil-drawer`);
    } else {
      log('warn', persona.id, 'outils-drawer', 'Aucune ligne outil à cliquer');
    }
  }

  // 5. UI : magasins drawer
  if (persona.screens.includes('magasins')) {
    await nav(page, 'magasins');
    await new Promise((r) => setTimeout(r, 700));
    const clicked = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('button')].filter((b) => b.querySelector('h3,p') && /Magasin|Atelier|Quincaillerie/i.test(b.textContent || ''));
      if (cards.length) { cards[0].click(); return true; }
      return false;
    });
    await new Promise((r) => setTimeout(r, 800));
    if (clicked) {
      log('pass', persona.id, 'magasins-drawer', 'Drawer magasin ouvert');
      await shoot(page, `${persona.id}-magasin-drawer`);
    }
  }

  // 5b. UI : filtres Travailleurs (si présent)
  if (persona.screens.includes('employes')) {
    await nav(page, 'employes');
    await new Promise((r) => setTimeout(r, 800));
    // cliquer chaque filtre d'état
    const filterLabels = ['Présents', 'Retards', 'Absents', 'Congés', 'Permissions', 'Tous'];
    for (const fl of filterLabels) {
      const ok = await page.evaluate((t) => {
        const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim().startsWith(t));
        if (b) { b.click(); return true; }
        return false;
      }, fl);
      await new Promise((r) => setTimeout(r, 400));
      if (ok) log('pass', persona.id, `employes-filter-${fl}`, 'Filtre appliqué');
      else log('warn', persona.id, `employes-filter-${fl}`, 'Filtre introuvable');
    }
    await shoot(page, `${persona.id}-employes-filtres`);
  }

  // 5c. UI : Stock — ouvrir formulaire mouvement + filtres journal
  if (persona.screens.includes('stock') && persona.role !== 'travailleur') {
    await nav(page, 'stock');
    await new Promise((r) => setTimeout(r, 800));
    // tester les filtres magasin
    const magasinBtns = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].filter((b) => /Magasin|Atelier|Quincaillerie|Tous/i.test(b.textContent || ''));
      return btns.length;
    });
    if (magasinBtns > 0) log('pass', persona.id, 'stock-magasin-filters', `${magasinBtns} filtres magasin présents`);
    else log('warn', persona.id, 'stock-magasin-filters', 'Aucun filtre magasin détecté');
    // journal filters
    const journalOk = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].find((b) => /Journal|Mouvements/i.test(b.textContent || ''));
      if (btns) { btns.click(); return true; }
      return false;
    });
    await new Promise((r) => setTimeout(r, 500));
    await shoot(page, `${persona.id}-stock`);
  }

  // 5d. UI : Outils — tester les filtres statut
  if (persona.screens.includes('outils') && persona.role !== 'travailleur') {
    await nav(page, 'outils');
    await new Promise((r) => setTimeout(r, 700));
    const statusFilters = ['Tous', 'Disponibles', 'En prêt', 'Maintenance', 'Réformés'];
    for (const sf of statusFilters) {
      const ok = await page.evaluate((t) => {
        const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim().startsWith(t));
        if (b) { b.click(); return true; }
        return false;
      }, sf);
      await new Promise((r) => setTimeout(r, 350));
      if (ok) log('pass', persona.id, `outils-filter-${sf}`, 'Filtre appliqué');
    }
    await shoot(page, `${persona.id}-outils-filtres`);
  }

  // 5e. UI : Espace — tester les tabs
  if (persona.screens.includes('espace')) {
    await nav(page, 'espace');
    await new Promise((r) => setTimeout(r, 900));
    for (const tab of ['Historique', 'Outils', 'Stock']) {
      const ok = await page.evaluate((t) => {
        const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim().startsWith(t));
        if (b) { b.click(); return true; }
        return false;
      }, tab);
      await new Promise((r) => setTimeout(r, 400));
      if (ok) log('pass', persona.id, `espace-tab-${tab}`, 'Tab activé');
    }
    await shoot(page, `${persona.id}-espace-tabs`);
  }

  // 6. Scan modal (si autorisé)
  if (persona.role !== 'travailleur') {
    const scanBtn = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /Scanner un code/i.test(x.textContent || ''));
      if (b) { b.click(); return true; }
      return false;
    });
    await new Promise((r) => setTimeout(r, 700));
    if (scanBtn) {
      const scanText = await page.evaluate(() => document.body.innerText);
      if (scanText.includes('Scanner') || scanText.includes('code') || scanText.includes('caméra')) {
        log('pass', persona.id, 'scan', 'Modale scanner ouverte');
      } else log('warn', persona.id, 'scan', 'Modale scanner non visible');
      // fermer
      await page.keyboard.press('Escape');
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // 7. Vérifier absence d'erreurs console/réseau pendant toute la session
  // Filtrer : 401 auth/me (check session boot), 403/409 des tests de permissions intentionnels
  const realErrs = errs.filter((e) => {
    if (/favicon|DevTools|Download the React/i.test(e)) return false;
    // 401 au boot = check session, normal
    if (/401/i.test(e)) return false;
    // 403 = tests de permissions intentionnels
    if (/403/i.test(e)) return false;
    // 409 = double review intentée / stock insuffisant dans le seed
    if (/409/i.test(e)) return false;
    // ERR_CONNECTION_TIMED_OUT = flaky réseau local
    if (/ERR_CONNECTION_TIMED_OUT/i.test(e)) return false;
    return true;
  });
  if (realErrs.length === 0) log('pass', persona.id, 'console', 'Aucune erreur console/réseau');
  else for (const e of realErrs.slice(0, 10)) log('error', persona.id, 'console', e);

  await context.close();
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  for (const persona of PERSONAS) {
    await testPersona(browser, persona);
  }
  await browser.close();

  // Résumé
  const errors = issues.filter((i) => i.sev === 'error');
  const warns = issues.filter((i) => i.sev === 'warn');
  const passes = issues.filter((i) => i.sev === 'pass');
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RÉSUMÉ AUDIT : ${passes.length} OK · ${warns.length} WARN · ${errors.length} ERROR`);
  console.log('='.repeat(60));
  if (errors.length) {
    console.log('\n--- ERREURS À CORRIGER ---');
    for (const e of errors) console.log(`✗ [${e.persona}] ${e.ctx}: ${e.msg}`);
  }
  if (warns.length) {
    console.log('\n--- AVERTISSEMENTS ---');
    for (const w of warns) console.log(`⚠ [${w.persona}] ${w.ctx}: ${w.msg}`);
  }
  // écrire rapport JSON
  const fs = await import('node:fs');
  fs.writeFileSync(`${process.env.TEMP}\\opencode\\audit-report.json`, JSON.stringify({ errors, warns, passes }, null, 2));
  console.log(`\nRapport: ${process.env.TEMP}\\opencode\\audit-report.json`);
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
