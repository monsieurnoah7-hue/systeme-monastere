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
  await page.setViewport({ width: 768, height: 1024 }); // Tablet kiosk view

  await page.goto('http://localhost:5173');
  await page.waitForSelector('input[autocomplete="username"]', { timeout: 8000 });
  await page.type('input[autocomplete="username"]', 'chef');
  await page.type('input[autocomplete="current-password"]', 'atelier226');
  await (await page.$('button[type="submit"]')).click();
  await page.waitForSelector('main', { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 1200));

  // Navigate to Pointage
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((el) =>
      el.textContent && el.textContent.includes('Pointage')
    );
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 1500));

  // Click on "Mode Borne Kiosque"
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((el) =>
      el.textContent && el.textContent.includes('Borne')
    );
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 1500));

  // Check if we need to select terminal
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((el) =>
      el.textContent && el.textContent.includes('Sélectionner')
    );
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 1200));

  // 1. Capture Alphabetical Mode (AZERTY)
  const shotAlpha = path.join(REPORT_DIR, '11_kiosk_keyboard_alpha.png');
  await page.screenshot({ path: shotAlpha });
  console.log('✓ Capture Clavier Mode Alphabétique (AZERTY):', shotAlpha);

  // 2. Click on "123" button to toggle to numeric mode
  await page.evaluate(() => {
    const btn123 = Array.from(document.querySelectorAll('button')).find(
      (el) => el.textContent && el.textContent.trim() === '123'
    );
    if (btn123) btn123.click();
  });
  await new Promise((r) => setTimeout(r, 800));

  // 3. Capture Numeric & Symbols Mode
  const shotNumeric = path.join(REPORT_DIR, '12_kiosk_keyboard_numeric.png');
  await page.screenshot({ path: shotNumeric });
  console.log('✓ Capture Clavier Mode Numérique & Symboles (123):', shotNumeric);

  // 4. Type a code using the virtual keys (e.g. 0 0 3)
  await page.evaluate(() => {
    const findAndClick = (txt) => {
      const b = Array.from(document.querySelectorAll('button')).find(
        (el) => el.textContent && el.textContent.trim() === txt
      );
      if (b) b.click();
    };
    findAndClick('0');
    findAndClick('0');
    findAndClick('3');
  });
  await new Promise((r) => setTimeout(r, 800));

  const shotTyped = path.join(REPORT_DIR, '13_kiosk_keyboard_typed.png');
  await page.screenshot({ path: shotTyped });
  console.log('✓ Capture Clavier avec Saisie Active (003):', shotTyped);

  await browser.close();
  console.log('Test terminé avec succès !');
})();
