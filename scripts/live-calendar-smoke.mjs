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

  const clickNow = selector => page.evaluate(value => {
    const element = document.querySelector(value);
    if (!(element instanceof HTMLElement)) throw new Error(`Element not found for click: ${value}`);
    element.click();
  }, selector);

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
  await clickNow('[data-planner-view="week"]');
  await page.waitForFunction(() => document.querySelectorAll('.planner-week-grid .planner-day').length === 7, { timeout: 5_000 });
  await clickNow('[data-planner-view="month"]');
  await page.waitForFunction(() => document.querySelectorAll('.planner-month-grid .planner-day').length >= 28, { timeout: 5_000 });

  await page.evaluate(() => {
    const input = document.querySelector('[data-planner-search]');
    if (!(input instanceof HTMLInputElement)) throw new Error('Calendar search input not found.');
    input.value = 'Family';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector('[data-planner-search]')?.value === 'Family', { timeout: 5_000 });
  await page.select('[data-planner-filter="person"]', 'family');
  await clickNow('[data-planner-clear]');
  await page.waitForFunction(() => document.querySelector('[data-planner-search]')?.value === '', { timeout: 5_000 });

  // Click a day tile and verify Event capture opens with the date and expanded event types.
  const dayDate = await page.$eval('.planner-month-grid .planner-day:not(.is-outside)', node => node.getAttribute('data-planner-day'));
  if (!dayDate) throw new Error('Planner day did not expose a date.');
  await clickNow('.planner-month-grid .planner-day:not(.is-outside)');
  await page.waitForSelector('.capture-pro form[data-capture-form-kind="Event"]', { timeout: 10_000 });

  const prefilledDate = await page.$eval('.capture-pro input[name="date"]', input => input.value);
  if (prefilledDate !== dayDate) throw new Error(`Day click did not prefill selected date: expected ${dayDate}, got ${prefilledDate}`);

  const eventTypes = await page.$$eval('.capture-pro select[name="category"] option', options => options.map(option => option.value));
  const requiredTypes = ['Birthday', 'Medical', 'Travel', 'Bill / Payment', 'Pet', 'Vehicle', 'Home', 'Childcare'];
  const missingTypes = requiredTypes.filter(type => !eventTypes.includes(type));
  if (missingTypes.length) throw new Error(`Expanded event types missing from Add Event: ${missingTypes.join(', ')}`);

  // Save a real expanded-type event and verify the category survives into Calendar.
  const smokeTitle = `Birthday smoke ${Date.now()}`;
  await page.type('.capture-pro input[name="title"]', smokeTitle);
  await page.select('.capture-pro select[name="category"]', 'Birthday');
  await clickNow('.capture-pro button[type="submit"]');
  await page.waitForSelector('.capture-pro .capture-success', { timeout: 10_000 });
  await clickNow('.capture-pro [data-capture-close]');
  await page.waitForFunction(() => !document.querySelector('.capture-pro'), { timeout: 10_000 });

  await page.waitForFunction(title => Array.from(document.querySelectorAll('.calendar-planner-host .planner-event strong')).some(node => node.textContent?.trim() === title), { timeout: 10_000 }, smokeTitle);
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-planner-filter="category"] option')).some(option => option.value === 'Birthday'), { timeout: 10_000 });
  await page.select('[data-planner-filter="category"]', 'Birthday');
  await page.waitForFunction(title => Array.from(document.querySelectorAll('.calendar-planner-host .planner-event strong')).some(node => node.textContent?.trim() === title), { timeout: 5_000 }, smokeTitle);
  await clickNow('[data-planner-clear]');

  // Reopen the saved Birthday event and verify edit mode preserves its event type.
  await page.evaluate(title => {
    const eventButton = Array.from(document.querySelectorAll('.calendar-planner-host .planner-event')).find(button => button.querySelector('strong')?.textContent?.trim() === title);
    if (!(eventButton instanceof HTMLButtonElement)) throw new Error(`Saved event not found: ${title}`);
    eventButton.click();
  }, smokeTitle);
  await page.waitForSelector('.capture-pro form[data-capture-form-kind="Event"]', { timeout: 10_000 });

  const editState = await page.evaluate(() => {
    const form = document.querySelector('.capture-pro form[data-capture-form-kind="Event"]');
    const heading = document.querySelector('.capture-pro .capture-form-heading .eyebrow');
    const title = document.querySelector('.capture-pro input[name="title"]');
    const category = document.querySelector('.capture-pro select[name="category"]');
    return {
      kind: form?.getAttribute('data-capture-form-kind'),
      heading: heading?.textContent?.trim(),
      title: title instanceof HTMLInputElement ? title.value : '',
      category: category instanceof HTMLSelectElement ? category.value : '',
      editRecordId: form?.getAttribute('data-calendar-edit-record-id'),
      originKey: form?.getAttribute('data-calendar-origin-key'),
    };
  });

  if (editState.kind !== 'Event' || !editState.editRecordId) throw new Error(`Saved local event did not open in edit mode: ${JSON.stringify(editState)}`);
  if (editState.title !== smokeTitle) throw new Error(`Saved event title was not preserved: ${JSON.stringify(editState)}`);
  if (editState.category !== 'Birthday') throw new Error(`Expanded event type was not preserved for editing: ${JSON.stringify(editState)}`);

  if (errors.length) throw new Error(`Browser errors during live calendar test:\n${errors.join('\n')}`);
  console.log('LIVE_CALENDAR_SMOKE_PASS', JSON.stringify({ url: siteUrl, dayDate, eventTypes: eventTypes.length, smokeTitle, editState }));
} finally {
  await browser.close();
}
