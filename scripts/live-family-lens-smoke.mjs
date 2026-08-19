import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const siteUrl = process.argv[2] || 'https://wojo0011.github.io/family-os/';
const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
const executablePath = candidates.find(path => existsSync(path));
if (!executablePath) throw new Error(`Chrome/Chromium not found. Checked: ${candidates.join(', ')}`);

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100 });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });

  const url = new URL(siteUrl); url.searchParams.set('lens-smoke', Date.now().toString());
  await page.goto(url.toString(), { waitUntil: 'networkidle2', timeout: 60_000 });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.sidebar button')).some(button => button.textContent?.includes('Family Hub')), { timeout: 30_000 });

  const nav = label => page.evaluate(label => {
    const button = Array.from(document.querySelectorAll('.sidebar button')).find(item => item.textContent?.includes(label));
    if (!(button instanceof HTMLButtonElement)) throw new Error(`Navigation button missing: ${label}`);
    button.click();
  }, label);

  await nav('Family Hub');
  await page.waitForSelector('.family-lens-module-host .family-lens-module', { timeout: 15_000 });
  const cardCount = await page.$$eval('[data-family-lens-card]', cards => cards.length);
  if (cardCount !== 5) throw new Error(`Expected 5 family lenses, found ${cardCount}.`);
  const privacyText = await page.$eval('.family-lens-explainer', node => node.textContent || '');
  if (!privacyText.includes('not authentication')) throw new Error('Lens privacy distinction is missing.');

  await page.click('[data-family-lens-use="teen"]');
  await page.waitForFunction(() => document.querySelector('.topbar .lens-picker.compact button.active b')?.textContent?.trim() === 'Teen');
  await page.waitForFunction(() => document.querySelector('[data-family-lens-card="teen"]')?.classList.contains('is-active'));
  const teenCurrent = await page.$eval('.family-lens-current h2', node => node.textContent?.trim());
  if (teenCurrent !== 'Teen lens') throw new Error(`Teen lens current state mismatch: ${teenCurrent}`);

  await nav('Today');
  await page.waitForFunction(() => (document.querySelector('.content .hero .eyebrow')?.textContent || '').includes('Teen lens'), { timeout: 10_000 });
  await nav('Family Hub');
  await page.waitForSelector('.family-lens-module-host:not([hidden])');
  await page.waitForFunction(() => document.querySelector('[data-family-lens-card="teen"]')?.classList.contains('is-active'));

  await page.click('[data-family-lens-use="family"]');
  await page.waitForFunction(() => document.querySelector('.topbar .lens-picker.compact button.active b')?.textContent?.trim() === 'Family');
  await page.waitForFunction(() => document.querySelector('[data-family-lens-card="family"]')?.classList.contains('is-active'));

  if (errors.length) throw new Error(`Browser errors during family lens smoke test:\n${errors.join('\n')}`);
  console.log('LIVE_FAMILY_LENS_SMOKE_PASS', JSON.stringify({ url: siteUrl, cardCount, teenSwitch: true, todayFollowedLens: true, familySwitch: true, privacyModelExplained: true }));
} finally {
  await browser.close();
}
