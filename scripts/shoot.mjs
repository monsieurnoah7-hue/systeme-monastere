import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:5173';
const OUT = path.join(os.tmpdir(), 'shots');
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: [
    '--window-size=1440,900',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${path.join(os.tmpdir(), 'opencode', 'fake-noise.y4m')}`,
    '--autoplay-policy=no-user-gesture-required',
    '--disable-gpu',
  ],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
});

const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  window.__printCalls = 0;
  window.print = () => {
    window.__printCalls += 1;
  };
});
const shot = async (name) => {
  await page.screenshot({ path: path.join(OUT, name) });
  console.log('shot', name);
};

async function waitForText(text, timeout = 15000) {
  await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);
}

async function clickText(text, { exact = true, tag = 'button, a, [role="button"], tr' } = {}) {
  const clicked = await page.evaluate(
    (t, ex, sel) => {
      const nodes = [...document.querySelectorAll(sel)].filter(
        (n) =>
          n.offsetParent !== null &&
          (ex ? n.textContent.trim() === t : n.textContent.includes(t)),
      );
      if (nodes.length === 0) return false;
      nodes[0].click();
      return true;
    },
    text,
    exact,
    tag,
  );
  if (!clicked) throw new Error(`no visible element with text: ${text}`);
}

try {
  // 1. login
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[placeholder="ex. magasinier"]');
  await shot('01-login.png');

  await page.type('input[placeholder="ex. magasinier"]', 'direction');
  await page.type('input[type="password"]', 'direction226');
  await clickText('Se connecter');
  await waitForText('Répartition des outils');

  await shot('02-dashboard.png');

  // 2. outils
  await clickText('Outils & QR', { exact: false });
  await waitForText('QR');
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length > 0);
  await shot('03-outils.png');
  await page.evaluate(() => document.querySelector('tbody tr')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForFunction(() => document.body.innerText.includes('Historique'));
  await shot('04-outil-fiche.png');
  await page.evaluate(() => document.querySelector('[aria-label="Fermer le panneau"]')?.click());

  // 3. pointage — deux états possibles : premier passage (aucun terminal →
  // banner « Aucun terminal enregistré » + bouton « Utiliser ») ou terminal
  // déjà connu du navigateur (pavé de saisie directement).
  await clickText('Pointage', { exact: false });
  let needsPickTerminal = true;
  try {
    await waitForText('terminal enregistré', 4000);
  } catch {
    needsPickTerminal = false;
  }
  if (needsPickTerminal) {
    await waitForText('Utiliser');
    await clickText('Utiliser');
  }
  await waitForText('Scanner badge');
  await shot('05-pointage-identify.png');

  // code de pointage EMP-008 = W3J6N (5 caractères alnum)
  const steps = ['W', 'W3', 'W3J', 'W3J6', 'W3J6N'];
  for (const expected of steps) {
    await clickText(expected.at(-1));
    await page.waitForFunction(
      (value) => document.querySelector('[data-code]')?.getAttribute('data-code') === value,
      { timeout: 5000 },
      expected,
    );
  }
  await clickText('Identifier');
  await waitForText('Pointer mon');
  await shot('06-pointage-fiche.png');

  const punchAction = await page.evaluate(() => {
    const labels = ['Pointer mon arrivée', 'Pointer mon départ'];
    return labels.find((l) => document.body.innerText.includes(l)) ?? null;
  });
  if (!punchAction) throw new Error('aucune action de pointage possible');
  console.log('punch action:', punchAction);
  await clickText(punchAction);
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Prendre la photo') && !b.disabled),
    { timeout: 20000 },
  );
  await shot('07-pointage-camera.png');
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Prendre la photo'));
    b?.click();
  });
  await waitForText('Valider le pointage');
  await page.waitForFunction(() => document.body.innerText.includes('Motif du retard') || document.body.innerText.includes('Valider le pointage'));
  await shot('08-pointage-selfie.png');

  // motif obligatoire si retard > tolérance
  const needsMotif = await page.evaluate(() => document.body.innerText.includes('Motif du retard'));
  if (needsMotif) {
    const options = await page.$$eval('select option', (opts) =>
      opts.map((o) => ({ v: o.value, t: o.textContent })).filter((o) => o.v),
    );
    await page.select('select', options[0].v);
    console.log('motif selected:', options[0].t);
    await shot('09-pointage-motif.png');
  }
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Valider le pointage'));
    b?.click();
  });
  await waitForText('enregistr', 20000);
  await shot('10-pointage-confirme.png');

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Imprimer la fiche'));
    b?.click();
  });
  await page.waitForFunction(() => document.getElementById('print-root')?.innerText.includes('Fiche de pointage'));
  await page.pdf({ path: path.join(OUT, 'fiche-pointage.pdf'), format: 'A6', printBackground: true });
  console.log('pdf fiche-pointage.pdf');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));

  // 4. mobile pass
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await waitForText('Répartition des outils');

  const term = await page.evaluate(() => localStorage.getItem('mf.terminal'));
  console.log('mobile terminal =', term);
  if (!term) await page.evaluate(() => localStorage.setItem('mf.terminal', 'TERM-ATELIER'));
  await shot('11-mobile-dashboard.png');
  await clickText('Pointage', { exact: false });
  await waitForText('Scanner badge');
  await shot('12-mobile-pointage.png');

  // 5. pass admin : stock, travailleurs, paramètres
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await waitForText('Répartition des outils');
  await page.evaluate(() => {
    [...document.querySelectorAll('[aria-label="Se déconnecter"]')]
      .filter((b) => b.offsetParent !== null)
      .at(0)
      ?.click();
  });
  await waitForText('Connexion');
  await page.type('input[placeholder="ex. magasinier"]', 'direction');
  await page.type('input[type="password"]', 'direction226');
  await clickText('Se connecter');
  await waitForText('Répartition des outils');

  await clickText('Stock', { exact: false });
  await waitForText('quincaillerie');
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length > 0);
  await shot('13-admin-stock.png');

  await clickText('Nouvelle référence');
  await waitForText('Désignation');
  await shot('14-stock-nouvelle-ref.png');
  await clickText('Annuler');

  await clickText('Sortie', { exact: true });
  await waitForText('Type de mouvement');
  await shot('15-stock-mouvement.png');
  await clickText('Annuler');

  // 5b. magasins (admin)
  await clickText('Magasins', { exact: false });
  await waitForText('Nouveau magasin');
  await page.waitForFunction(() => document.body.innerText.includes('Magasin A'));
  await shot('20-admin-magasins.png');
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Magasin A'));
    card?.click();
  });
  await page.waitForFunction(() => document.body.innerText.includes('Contenu') || document.body.innerText.includes('Outils'));
  await new Promise((r) => setTimeout(r, 500));
  await shot('21-admin-magasin-detail.png');
  await page.evaluate(() => document.querySelector('[aria-label="Fermer le panneau"]')?.click());

  // 5c. espace direction (sans fiche salarié)
  await clickText('Mon espace', { exact: false });
  await waitForText('Bonjour');
  await new Promise((r) => setTimeout(r, 600));
  await shot('22-direction-espace.png');

  await clickText('Travailleurs', { exact: false });
  await waitForText('badges de pointage');
  await page.waitForFunction(() => document.querySelectorAll('li').length > 0);
  await shot('16-admin-travailleurs.png');

  await clickText('Badge');
  await waitForText('Révoquer l’ancien badge');
  await new Promise((r) => setTimeout(r, 400));
  await shot('16b-badge-aperçu.png');

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Planche A4 des actifs'));
    b?.click();
  });
  await page.waitForFunction(() => document.getElementById('print-root')?.innerText.includes('Badges de pointage'));
  await page.pdf({ path: path.join(OUT, 'badges-planche.pdf'), format: 'A4', printBackground: true });
  console.log('pdf badges-planche.pdf');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));

  await page.reload({ waitUntil: 'networkidle2' });
  await waitForText('Répartition des outils');
  await clickText('Travailleurs', { exact: false });
  await waitForText('badges de pointage');
  await page.waitForFunction(() => document.querySelectorAll('li').length > 0);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Badge');
    if (!b) throw new Error('bouton Badge introuvable');
    b.click();
  });
  await waitForText('Imprimer la carte');
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Imprimer la carte'));
    b?.click();
  });
  await page.waitForFunction(() => document.getElementById('print-root')?.innerText.includes('Menuiserie · Mont Fèbè'));
  await page.pdf({ path: path.join(OUT, 'badge-carte.pdf'), format: 'A6', printBackground: true });
  console.log('pdf badge-carte.pdf');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));

  await page.reload({ waitUntil: 'networkidle2' });
  await waitForText('Répartition des outils', 30000);
  await clickText('Paramètres', { exact: false });
  await waitForText('Horaires', 30000);
  await shot('17-admin-parametres.png');
  await page.evaluate(() => {
    const main = document.querySelector('main');
    if (main) main.scrollTop = main.scrollHeight;
  });
  await new Promise((r) => setTimeout(r, 400));
  await shot('18-admin-parametres-bas.png');

  // 5d. carte « Sauvegardes & maintenance » (admin) — sauvegarde à la demande
  await waitForText('Sauvegardes & maintenance');
  await shot('18b-maintenance-carte.png');
  await page.evaluate(() => {
    const main = document.querySelector('main');
    if (main) main.scrollTop = main.scrollHeight;
  });
  await new Promise((r) => setTimeout(r, 300));
  await clickText('Sauvegarder maintenant');
  await waitForText('Sauvegarde cloud effectuée', 30000);
  await shot('18c-maintenance-sauvegarde-ok.png');
  await page.evaluate(() => {
    const main = document.querySelector('main');
    if (main) main.scrollTop = main.scrollHeight;
  });
  await new Promise((r) => setTimeout(r, 400));
  const hasList = await page.evaluate(() => document.body.innerText.includes('Sauvegardes cloud ('));
  if (!hasList) throw new Error('liste des sauvegardes cloud introuvable');
  await shot('18d-maintenance-liste.png');
  const purgeArmed = await page.evaluate(
    () => document.body.innerText.includes('Tapez RESET pour confirmer'),
  );
  if (!purgeArmed) throw new Error('bloc de purge absent');
  console.log('purge zone présente, non déclenchée');

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await waitForText('Répartition des outils');
  await clickText('Stock', { exact: false });
  await waitForText('quincaillerie');
  await shot('19-mobile-stock.png');

  // 6. espace travailleur (login ouvrier)
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    [...document.querySelectorAll('[aria-label="Se déconnecter"]')]
      .filter((b) => b.offsetParent !== null)
      .at(0)
      ?.click();
  });
  await waitForText('Connexion');
  await page.type('input[placeholder="ex. magasinier"]', 'ouvrier');
  await page.type('input[type="password"]', 'atelier226');
  await clickText('Se connecter');
  await waitForText('Bonjour');
  await page.waitForFunction(() => document.body.innerText.includes('Aimé') || document.body.innerText.includes('Menuisier'));
  await new Promise((r) => setTimeout(r, 800));
  await shot('23-travailleur-espace.png');
  await clickText('Outils', { exact: true });
  await new Promise((r) => setTimeout(r, 600));
  await shot('24-travailleur-espace-outils.png');
} catch (err) {
  console.error('FAIL:', err.message);
  await shot('99-erreur.png');
  const text = await page.evaluate(() => document.body.innerText.slice(0, 600));
  console.log('page text:', text.replace(/\n/g, ' | '));
  process.exitCode = 1;
} finally {
  await browser.close();
}
