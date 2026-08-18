import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const siteUrl = process.argv[2] || 'https://wojo0011.github.io/family-os/';
const candidates = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const executablePath = candidates.find(path => existsSync(path));
if (!executablePath) throw new Error(`Chrome/Chromium not found. Checked: ${candidates.join(', ')}`);

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  const url = new URL(siteUrl);
  url.searchParams.set('live-smoke', Date.now().toString());
  await page.goto(url.toString(), { waitUntil: 'networkidle2', timeout: 60_000 });

  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(button => button.textContent?.trim() === '+ Add'), { timeout: 30_000 });
  await page.evaluate(() => {
    const add = Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim() === '+ Add');
    if (!(add instanceof HTMLButtonElement)) throw new Error('Top-bar + Add button not found.');
    add.click();
  });

  await page.waitForSelector('.capture-pro-stage .capture-option[data-capture-kind="Event"]', { timeout: 10_000 });
  await page.click('.capture-pro-stage .capture-option[data-capture-kind="Event"]');
  await page.waitForSelector('.capture-pro-stage form[data-capture-form][data-capture-form-kind="Event"]', { timeout: 10_000 });

  const title = '.capture-pro-stage input[name="title"]';
  await page.waitForSelector(title);
  await page.evaluate(selector => {
    const input = document.querySelector(selector);
    if (!(input instanceof HTMLInputElement)) throw new Error('Event title input missing.');
    input.dataset.smokeIdentity = 'original';
  }, title);

  // Repeated pointer focus must never cause the form to slide/re-render.
  for (let index = 0; index < 4; index += 1) {
    await page.click(title);
    await new Promise(resolve => setTimeout(resolve, 120));
    const state = await page.evaluate(selector => {
      const stage = document.querySelector('.capture-pro-stage');
      const input = document.querySelector(selector);
      return {
        view: stage?.getAttribute('data-capture-view'),
        identity: input?.getAttribute('data-smoke-identity'),
        activeName: document.activeElement?.getAttribute('name'),
      };
    }, title);
    if (state.view !== 'form' || state.identity !== 'original' || state.activeName !== 'title') {
      throw new Error(`Field click retriggered modal navigation: ${JSON.stringify(state)}`);
    }
  }

  await page.type(title, 'Live smoke event');
  if (await page.$eval(title, input => input.value) !== 'Live smoke event') throw new Error('Typing into event title failed.');

  await page.click('.capture-pro-stage input[name="date"]');
  await page.select('.capture-pro-stage select[name="person"]', 'Dad');
  await page.click('.capture-pro-stage textarea[name="notes"]');
  await page.type('.capture-pro-stage textarea[name="notes"]', 'Field focus regression test');

  const finalState = await page.evaluate(() => {
    const stage = document.querySelector('.capture-pro-stage');
    const form = document.querySelector('form[data-capture-form]');
    const titleInput = document.querySelector('input[name="title"]');
    return {
      view: stage?.getAttribute('data-capture-view'),
      formKind: form?.getAttribute('data-capture-form-kind'),
      wrongFormMarker: form?.hasAttribute('data-capture-kind'),
      identity: titleInput?.getAttribute('data-smoke-identity'),
      title: titleInput instanceof HTMLInputElement ? titleInput.value : null,
    };
  });

  if (finalState.view !== 'form' || finalState.formKind !== 'Event' || finalState.wrongFormMarker || finalState.identity !== 'original' || finalState.title !== 'Live smoke event') {
    throw new Error(`Capture form state changed unexpectedly after field clicks: ${JSON.stringify(finalState)}`);
  }

  if (errors.length) throw new Error(`Browser errors during live test:\n${errors.join('\n')}`);
  console.log('LIVE_CAPTURE_SMOKE_PASS', JSON.stringify({ url: siteUrl, finalState }));
} finally {
  await browser.close();
}
