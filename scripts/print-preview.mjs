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
  args: ['--disable-gpu'],
  defaultViewport: { width: 1000, height: 1400 },
});
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  window.print = () => {};
});
async function waitForText(text, timeout = 15000) {
  await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);
}

await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.type('input[placeholder="ex. magasinier"]', 'admin');
await page.type('input[type="password"]', 'admin226');
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Se connecter'))?.click());
await waitForText('Tableau de bord');
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Travailleurs'))?.click());
await waitForText('badges de pointage');
await page.waitForFunction(() => document.querySelectorAll('li').length > 0);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Badge');
  b?.click();
});
await waitForText('Imprimer la carte');

// carte individuelle
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Imprimer la carte'));
  b?.click();
});
await page.waitForFunction(() => document.getElementById('print-root')?.innerText.includes('Menuiserie · Mont Fèbè'));
await page.emulateMediaType('print');
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: path.join(OUT, 'print-badge-carte.png'), fullPage: true });
console.log('print-badge-carte.png');
await page.emulateMediaType('screen');
await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));

// planche A4
await page.reload({ waitUntil: 'networkidle2' });
await waitForText('Tableau de bord');
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Travailleurs'))?.click());
await waitForText('badges de pointage');
await page.waitForFunction(() => document.querySelectorAll('li').length > 0);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Badge');
  b?.click();
});
await waitForText('Planche A4');
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Planche A4 des actifs'));
  b?.click();
});
await page.waitForFunction(() => document.getElementById('print-root')?.innerText.includes('Badges de pointage'));
await page.emulateMediaType('print');
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: path.join(OUT, 'print-badges-planche.png'), fullPage: true });
console.log('print-badges-planche.png');
await browser.close();
