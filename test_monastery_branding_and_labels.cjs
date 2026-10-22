const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const REPORT_DIR = path.join(__dirname, 'persona_audit_reports');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // 1. Capture Login Screen with official Monastery Logo
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[autocomplete="username"]', { timeout: 8000 });
  const shotLogin = path.join(REPORT_DIR, '14_login_official_logo.png');
  await page.screenshot({ path: shotLogin });
  console.log('✓ Capture Écran Login avec Logo Officiel:', shotLogin);

  // Click on "Direction" demo button
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (el) => el.textContent && el.textContent.trim() === 'Direction'
    );
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 400));

  // Submit login form
  await (await page.$('button[type="submit"]')).click();
  await page.waitForSelector('main', { timeout: 8000 });
  await page.waitForFunction(() => !document.body.innerText.includes('Chargement'), { timeout: 12000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));

  // 2. Capture Sidebar Branding
  const shotSidebar = path.join(REPORT_DIR, '15_desktop_sidebar_branding.png');
  await page.screenshot({ path: shotSidebar });
  console.log('✓ Capture Sidebar Desktop avec Logo:', shotSidebar);

  // 3. Navigate to Employés
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((el) =>
      el.textContent && el.textContent.includes('Équipe')
    );
    if (btn) btn.click();
  });
  await page.waitForFunction(() => !document.body.innerText.includes('Chargement'), { timeout: 12000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));

  // Click on first Badge button
  await page.evaluate(() => {
    const badgeBtn = Array.from(document.querySelectorAll('button')).find((el) =>
      el.textContent && el.textContent.trim() === 'Badge'
    );
    if (badgeBtn) badgeBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1500));

  const shotBadge = path.join(REPORT_DIR, '16_official_worker_badge_cr80.png');
  await page.screenshot({ path: shotBadge });
  console.log('✓ Capture Badge Ouvrier CR-80 avec Logo Officiel:', shotBadge);

  // Close modal
  await page.evaluate(() => {
    const closeBtn = Array.from(document.querySelectorAll('button')).find((el) =>
      el.textContent && el.textContent.includes('Fermer')
    );
    if (closeBtn) closeBtn.click();
  });
  await new Promise((r) => setTimeout(r, 800));

  // 4. Navigate to Outils
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((el) =>
      el.textContent && el.textContent.includes('Outils')
    );
    if (btn) btn.click();
  });
  await page.waitForFunction(() => !document.body.innerText.includes('Chargement'), { timeout: 12000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));

  // Open "Planche A4 QR" modal
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((el) =>
      el.textContent && el.textContent.includes('Planche A4 QR')
    );
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 1200));

  const shotTools = path.join(REPORT_DIR, '17_official_tool_labels_modal.png');
  await page.screenshot({ path: shotTools });
  console.log('✓ Capture Modale Planche Étiquettes Outils:', shotTools);

  await browser.close();
  console.log('Tous les tests visuels ont réussi !');
})();
