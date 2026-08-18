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

  const setValueNow = (selector, value) => page.evaluate(({ selector: currentSelector, value: currentValue }) => {
    const element = document.querySelector(currentSelector);
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) {
      throw new Error(`Form control not found: ${currentSelector}`);
    }
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(element, currentValue);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, { selector, value });

  const url = new URL(siteUrl);
  url.searchParams.set('health-smoke', Date.now().toString());
  await page.goto(url.toString(), { waitUntil: 'networkidle2', timeout: 60_000 });

  await page.evaluate(() => {
    localStorage.removeItem('family-os:health-providers-v1');
    localStorage.removeItem('family-os:capture-records-v1');
  });
  await page.reload({ waitUntil: 'networkidle2' });

  await page.waitForFunction(() => Array.from(document.querySelectorAll('.sidebar button')).some(button => button.textContent?.includes('Health')), { timeout: 30_000 });
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('.sidebar button')).find(item => item.textContent?.includes('Health'));
    if (!(button instanceof HTMLButtonElement)) throw new Error('Health navigation button not found.');
    button.click();
  });

  await page.waitForSelector('.health-module-host .health-module', { timeout: 15_000 });
  await page.waitForSelector('.provider-panel .primary', { timeout: 10_000 });
  await clickNow('.provider-panel .primary');
  await page.waitForSelector('.health-modal input[placeholder="Dr. Jane Smith"]', { timeout: 10_000 });

  const sixMonthsAgo = await page.evaluate(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 6);
    date.setDate(date.getDate() - 2);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });

  await setValueNow('.health-modal input[placeholder="Dr. Jane Smith"]', 'Dr. Live Dentist');
  await setValueNow('.health-modal select', 'Dentist');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.health-modal select')).some(select => select.value === 'Dentist'), { timeout: 5_000 });
  await page.evaluate(lastVisit => {
    const date = Array.from(document.querySelectorAll('.health-modal input')).find(input => input.type === 'date');
    if (!(date instanceof HTMLInputElement)) throw new Error('Last visit input not found.');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(date, lastVisit);
    date.dispatchEvent(new Event('input', { bubbles: true }));
    date.dispatchEvent(new Event('change', { bubbles: true }));
  }, sixMonthsAgo);

  const followUp = await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('.health-modal select'));
    return selects.find(select => Array.from(select.options).some(option => option.value === '6'))?.value;
  });
  if (followUp !== '6') throw new Error(`Dentist did not default to a 6-month reminder. Got: ${followUp}`);

  await page.evaluate(() => {
    const save = Array.from(document.querySelectorAll('.health-modal button')).find(button => button.textContent?.trim() === 'Save provider');
    if (!(save instanceof HTMLButtonElement)) throw new Error('Save provider button missing.');
    save.click();
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.provider-card h3')).some(node => node.textContent?.includes('Dr. Live Dentist')), { timeout: 10_000 });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.health-alert strong')).some(node => node.textContent?.includes('Dentist follow-up')), { timeout: 10_000 });

  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('.provider-card')).find(node => node.textContent?.includes('Dr. Live Dentist'));
    const appointment = Array.from(card?.querySelectorAll('button') ?? []).find(button => button.textContent?.includes('Appointment'));
    if (!(appointment instanceof HTMLButtonElement)) throw new Error('Provider appointment button missing.');
    appointment.click();
  });
  await page.waitForSelector('.health-appointment-modal form', { timeout: 10_000 });

  const appointmentDate = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  await setValueNow('.health-appointment-modal input[name="date"]', appointmentDate);
  await page.evaluate(() => {
    const save = Array.from(document.querySelectorAll('.health-appointment-modal button')).find(button => button.textContent?.trim() === 'Save appointment');
    if (!(save instanceof HTMLButtonElement)) throw new Error('Save appointment button missing.');
    save.click();
  });
  await page.waitForFunction(() => !document.querySelector('.health-appointment-modal'), { timeout: 10_000 });

  const stored = await page.evaluate(() => ({
    providers: JSON.parse(localStorage.getItem('family-os:health-providers-v1') || '[]'),
    records: JSON.parse(localStorage.getItem('family-os:capture-records-v1') || '[]'),
    syncText: document.querySelector('.provider-sync-note')?.textContent || '',
  }));

  if (stored.providers.length !== 1 || stored.providers[0]?.name !== 'Dr. Live Dentist') throw new Error(`Provider was not saved correctly: ${JSON.stringify(stored.providers)}`);
  if (stored.providers[0]?.followUpMonths !== 6) throw new Error('Dentist follow-up interval was not persisted.');
  const appointment = stored.records.find(record => record.kind === 'Event' && record.values?.title?.includes('Dr. Live Dentist'));
  if (!appointment) throw new Error(`Provider appointment was not saved into calendar records: ${JSON.stringify(stored.records)}`);
  if (appointment.values.category !== 'Dental') throw new Error(`Provider appointment category should be Dental, got ${appointment.values.category}`);
  if (!stored.syncText.includes('Google Contacts')) throw new Error('Google Contacts sync-readiness message missing.');

  if (errors.length) throw new Error(`Browser errors during live health test:\n${errors.join('\n')}`);
  console.log('LIVE_HEALTH_SMOKE_PASS', JSON.stringify({ url: siteUrl, provider: stored.providers[0].name, followUpMonths: stored.providers[0].followUpMonths, appointmentCategory: appointment.values.category }));
} finally {
  await browser.close();
}
