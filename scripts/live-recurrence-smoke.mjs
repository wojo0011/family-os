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

  const setValue = (selector, value) => page.evaluate(({ selector, value }) => {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) throw new Error(`Control missing: ${selector}`);
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, { selector, value });

  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const url = new URL(siteUrl); url.searchParams.set('recurrence-smoke', Date.now().toString());
  await page.goto(url.toString(), { waitUntil: 'networkidle2', timeout: 60_000 });
  await page.evaluate(() => localStorage.removeItem('family-os:capture-records-v1'));
  await page.reload({ waitUntil: 'networkidle2' });

  await page.waitForFunction(() => Array.from(document.querySelectorAll('.sidebar button')).some(button => button.textContent?.includes('Calendar')), { timeout: 30_000 });
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('.sidebar button')).find(item => item.textContent?.includes('Calendar'));
    if (!(button instanceof HTMLButtonElement)) throw new Error('Calendar button missing.');
    button.click();
  });
  await page.waitForSelector('.calendar-planner-shell', { timeout: 15_000 });

  async function openCapture(kind) {
    await page.evaluate(() => {
      const add = Array.from(document.querySelectorAll('.topbar button')).find(button => button.textContent?.includes('+ Add'));
      if (!(add instanceof HTMLButtonElement)) throw new Error('Topbar Add button missing.');
      add.click();
    });
    await page.waitForSelector(`.capture-option[data-capture-kind="${kind}"]`, { timeout: 10_000 });
    await page.evaluate(kind => {
      const option = document.querySelector(`.capture-option[data-capture-kind="${CSS.escape(kind)}"]`);
      if (!(option instanceof HTMLButtonElement)) throw new Error(`Capture option missing: ${kind}`);
      option.click();
    }, kind);
    await page.waitForSelector(`form[data-capture-form-kind="${kind}"]`, { timeout: 10_000 });
  }

  async function saveAndClose(kind) {
    await page.click(`form[data-capture-form-kind="${kind}"] .capture-save`);
    await page.waitForSelector('.capture-success [data-capture-close]', { timeout: 10_000 });
    await page.click('.capture-success [data-capture-close]');
    await page.waitForFunction(() => !document.querySelector('.capture-pro-host'), { timeout: 10_000 });
  }

  async function assertSimpleRecurrenceOptions(kind) {
    const options = await page.$$eval(`form[data-capture-form-kind="${kind}"] select[name="recurrence"] option`, nodes => nodes.map(node => node.textContent));
    for (const expected of ['Does not repeat', 'Weekly', 'Biweekly', 'Monthly', 'Yearly']) {
      if (!options.includes(expected)) throw new Error(`${kind} recurrence option missing: ${expected}. Found ${options.join(', ')}`);
    }
  }

  await openCapture('Event');
  await assertSimpleRecurrenceOptions('Event');
  await setValue('form[data-capture-form-kind="Event"] input[name="title"]', 'Weekly family event smoke');
  await setValue('form[data-capture-form-kind="Event"] input[name="date"]', today);
  await setValue('form[data-capture-form-kind="Event"] input[name="time"]', '09:00');
  await setValue('form[data-capture-form-kind="Event"] select[name="person"]', 'Family');
  await setValue('form[data-capture-form-kind="Event"] select[name="category"]', 'Family');
  await setValue('form[data-capture-form-kind="Event"] select[name="recurrence"]', 'Weekly');
  await saveAndClose('Event');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-recurring-injected] strong')).filter(node => node.textContent?.includes('Weekly family event smoke')).length >= 2, { timeout: 15_000 });

  await openCapture('Reminder');
  await assertSimpleRecurrenceOptions('Reminder');
  await setValue('form[data-capture-form-kind="Reminder"] input[name="title"]', 'Biweekly reminder smoke');
  await setValue('form[data-capture-form-kind="Reminder"] input[name="date"]', today);
  await setValue('form[data-capture-form-kind="Reminder"] input[name="time"]', '10:00');
  await setValue('form[data-capture-form-kind="Reminder"] select[name="person"]', 'Family');
  await setValue('form[data-capture-form-kind="Reminder"] select[name="priority"]', 'Normal');
  await setValue('form[data-capture-form-kind="Reminder"] select[name="recurrence"]', 'Biweekly');
  await saveAndClose('Reminder');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-recurring-injected] strong')).some(node => node.textContent?.includes('Biweekly reminder smoke')), { timeout: 15_000 });

  await openCapture('Bill');
  const billOptions = await page.$$eval('form[data-capture-form-kind="Bill"] select[name="recurrence"] option', nodes => nodes.map(node => node.textContent));
  for (const expected of ['Weekly', 'Biweekly', 'Monthly', 'Yearly']) if (!billOptions.includes(expected)) throw new Error(`Bill recurrence option missing: ${expected}`);
  await setValue('form[data-capture-form-kind="Bill"] input[name="bill"]', 'Monthly bill smoke');
  await setValue('form[data-capture-form-kind="Bill"] input[name="amount"]', '125.00');
  await setValue('form[data-capture-form-kind="Bill"] input[name="dueDate"]', today);
  await setValue('form[data-capture-form-kind="Bill"] select[name="category"]', 'Utilities');
  await setValue('form[data-capture-form-kind="Bill"] select[name="recurrence"]', 'Monthly');
  await setValue('form[data-capture-form-kind="Bill"] select[name="person"]', 'Family');
  await setValue('form[data-capture-form-kind="Bill"] select[name="status"]', 'Unpaid');
  await setValue('form[data-capture-form-kind="Bill"] select[name="autopay"]', 'No');
  await saveAndClose('Bill');

  await page.waitForSelector('[data-planner-nav="next"]');
  await page.click('[data-planner-nav="next"]');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-recurring-injected] strong')).some(node => node.textContent?.includes('Monthly bill smoke')), { timeout: 15_000 });

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('family-os:capture-records-v1') || '[]'));
  const event = stored.find(record => record.kind === 'Event' && record.values?.title === 'Weekly family event smoke');
  const reminder = stored.find(record => record.kind === 'Reminder' && record.values?.title === 'Biweekly reminder smoke');
  const bill = stored.find(record => record.kind === 'Bill' && record.values?.bill === 'Monthly bill smoke');
  if (event?.values.recurrence !== 'Weekly') throw new Error(`Weekly Event recurrence not persisted: ${JSON.stringify(event)}`);
  if (reminder?.values.recurrence !== 'Biweekly') throw new Error(`Biweekly Reminder recurrence not persisted: ${JSON.stringify(reminder)}`);
  if (bill?.values.recurrence !== 'Monthly') throw new Error(`Monthly Bill recurrence not persisted: ${JSON.stringify(bill)}`);
  if (errors.length) throw new Error(`Browser errors during recurrence smoke test:\n${errors.join('\n')}`);

  console.log('LIVE_RECURRENCE_SMOKE_PASS', JSON.stringify({
    url: siteUrl,
    event: event.values.recurrence,
    reminder: reminder.values.recurrence,
    bill: bill.values.recurrence,
    simpleOptions: ['Weekly', 'Biweekly', 'Monthly', 'Yearly'],
  }));
} finally {
  await browser.close();
}
