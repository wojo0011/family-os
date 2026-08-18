import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const siteUrl = process.argv[2] || 'https://wojo0011.github.io/family-os/';
const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
const executablePath = candidates.find(path => existsSync(path));
if (!executablePath) throw new Error(`Chrome/Chromium not found. Checked: ${candidates.join(', ')}`);

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });

  const url = new URL(siteUrl);
  url.searchParams.set('calendar-smoke', Date.now().toString());
  await page.goto(url.toString(), { waitUntil: 'networkidle2', timeout: 60_000 });

  await page.waitForFunction(() => Array.from(document.querySelectorAll('.sidebar button')).some(button => button.textContent?.includes('Calendar')), { timeout: 30_000 });
  await page.evaluate(() => {
    const calendar = Array.from(document.querySelectorAll('.sidebar button')).find(button => button.textContent?.includes('Calendar'));
    if (!(calendar instanceof HTMLButtonElement)) throw new Error('Calendar navigation button not found.');
    calendar.click();
  });

  await page.waitForSelector('.calendar-planner-host .calendar-planner-shell', { timeout: 15_000 });
  await page.waitForSelector('[data-planner-view="week"]');
  await page.click('[data-planner-view="week"]');
  await page.waitForFunction(() => document.querySelectorAll('.planner-week-grid .planner-day').length === 7, { timeout: 5_000 });
  await page.click('[data-planner-view="month"]');
  await page.waitForFunction(() => document.querySelectorAll('.planner-month-grid .planner-day').length >= 28, { timeout: 5_000 });

  const search = '[data-planner-search]';
  await page.click(search);
  await page.type(search, 'Family');
  await page.waitForFunction(() => document.querySelector('[data-planner-search]')?.value === 'Family', { timeout: 5_000 });
  await page.select('[data-planner-filter="person"]', 'family');
  await page.click('[data-planner-clear]');
  await page.waitForFunction(() => document.querySelector('[data-planner-search]')?.value === '', { timeout: 5_000 });

  // Click a day tile background and verify Event capture opens with that date prefilled.
  const dayDate = await page.$eval('.planner-month-grid .planner-day:not(.is-outside)', node => node.getAttribute('data-planner-day'));
  if (!dayDate) throw new Error('Planner day did not expose a date.');
  await page.evaluate(() => {
    const day = document.querySelector('.planner-month-grid .planner-day:not(.is-outside)');
    if (!(day instanceof HTMLElement)) throw new Error('Planner day not found.');
    day.click();
  });
  await page.waitForSelector('.capture-pro form[data-capture-form-kind="Event"]', { timeout: 10_000 });
  const prefilledDate = await page.$eval('.capture-pro input[name="date"]', input => input.value);
  if (prefilledDate !== dayDate) throw new Error(`Day click did not prefill selected date: expected ${dayDate}, got ${prefilledDate}`);
  await page.click('.capture-pro [data-capture-close]');
  await page.waitForSelector('.capture-pro', { hidden: true, timeout: 10_000 }).catch(() => undefined);

  // Click a visible event and verify the detail/edit form opens.
  await page.waitForSelector('.calendar-planner-host .planner-event', { timeout: 10_000 });
  const eventText = await page.$eval('.calendar-planner-host .planner-event strong', node => node.textContent?.trim() || '');
  await page.click('.calendar-planner-host .planner-event');
  await page.waitForSelector('.capture-pro form[data-capture-form-kind]', { timeout: 10_000 });
  const editState = await page.evaluate(() => {
    const form = document.querySelector('.capture-pro form[data-capture-form-kind]');
    const heading = document.querySelector('.capture-pro .capture-form-heading .eyebrow');
    const title = document.querySelector('.capture-pro input[name="title"]');
    return {
      kind: form?.getAttribute('data-capture-form-kind'),
      heading: heading?.textContent?.trim(),
      title: title instanceof HTMLInputElement ? title.value : '',
      editRecordId: form?.getAttribute('data-calendar-edit-record-id'),
      originKey: form?.getAttribute('data-calendar-origin-key'),
    };
  });
  if (!editState.kind) throw new Error(`Event click did not open an editable record form: ${JSON.stringify(editState)}`);
  if (!editState.editRecordId && !editState.originKey) throw new Error(`Event click opened a plain add form instead of edit mode: ${JSON.stringify(editState)}`);
  if (editState.kind === 'Event' && eventText && !editState.title) throw new Error('Event edit form did not preload title.');

  if (errors.length) throw new Error(`Browser errors during live calendar test:\n${errors.join('\n')}`);
  console.log('LIVE_CALENDAR_SMOKE_PASS', JSON.stringify({ url: siteUrl, dayDate, eventText, editState }));
} finally {
  await browser.close();
}
