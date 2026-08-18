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
  await page.click('.provider-panel .primary');
  await page.waitForSelector('.health-modal input[placeholder="Dr. Jane Smith"]', { timeout: 10_000 });

  const sixMonthsAgo = await page.evaluate(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 6);
    date.setDate(date.getDate() - 2);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });

  await page.type('.health-modal input[placeholder="Dr. Jane Smith"]', 'Dr. Live Dentist');
  await page.select('.health-modal select', 'Dentist');
  await page.evaluate(lastVisit => {
    const inputs = Array.from(document.querySelectorAll('.health-modal input'));
    const date = inputs.find(input => input.type === 'date');
    if (!(date instanceof HTMLInputElement)) throw new Error('Last visit input not found.');
    date.value = lastVisit;
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
  await page.evaluate(dateValue => {
    const date = document.querySelector('.health-appointment-modal input[name="date"]');
    if (!(date instanceof HTMLInputElement)) throw new Error('Appointment date input missing.');
    date.value = dateValue;
  }, appointmentDate);
  await page.evaluate(() => {
    const save = Array.from(document.querySelectorAll('.health-appointment-modal button')).find(button => button.textContent?.trim() === 'Save appointment');
    if (!(save instanceof HTMLButtonElement)) throw new Error('Save appointment button missing.');
    save.click();
  });
  await page.waitForFunction(() => !document.querySelector('.health-appointment-modal'), { timeout: 10_000 });

  const stored = await page.evaluate(() => {
    const providers = JSON.parse(localStorage.getItem('family-os:health-providers-v1') || '[]');
    const records = JSON.parse(localStorage.getItem('family-os:capture-records-v1') || '[]');
    return { providers, records };
  });

  if (stored.providers.length !== 1 || stored.providers[0]?.name !== 'Dr. Live Dentist') throw new Error(`Provider was not saved correctly: ${JSON.stringify(stored.providers)}`);
  if (stored.providers[0]?.followUpMonths !== 6) throw new Error('Dentist follow-up interval was not persisted.');
  const appointment = stored.records.find(record => record.kind === 'Event' && record.values?.title?.includes('Dr. Live Dentist'));
  if (!appointment) throw new Error(`Provider appointment was not saved into calendar records: ${JSON.stringify(stored.records)}`);
  if (appointment.values.category !== 'Dental') throw new Error(`Provider appointment category should be Dental, got ${appointment.values.category}`);

  const syncText = await page.$eval('.provider-sync-note', node => node.textContent || '');
  if (!syncText.includes('Google Contacts')) throw new Error('Google Contacts sync-readiness message missing.');

  if (errors.length) throw new Error(`Browser errors during live health test:\n${errors.join('\n')}`);
  console.log('LIVE_HEALTH_SMOKE_PASS', JSON.stringify({ url: siteUrl, provider: stored.providers[0].name, followUpMonths: stored.providers[0].followUpMonths, appointmentCategory: appointment.values.category }));
} finally {
  await browser.close();
}
