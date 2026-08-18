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

  const setDoseTime = (index, value) => page.evaluate(({ index, value }) => {
    const inputs = Array.from(document.querySelectorAll('.dose-time-control input[type="time"]'));
    const input = inputs[index];
    if (!(input instanceof HTMLInputElement)) throw new Error(`Dose time ${index} not found.`);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { index, value });

  const url = new URL(siteUrl);
  url.searchParams.set('health-smoke', Date.now().toString());
  await page.goto(url.toString(), { waitUntil: 'networkidle2', timeout: 60_000 });

  await page.evaluate(() => {
    localStorage.removeItem('family-os:health-providers-v1');
    localStorage.removeItem('family-os:capture-records-v1');
    localStorage.removeItem('family-os:medication-adherence-v1');
    localStorage.removeItem('family-os:notification-seen-v1');
  });
  await page.reload({ waitUntil: 'networkidle2' });

  const today = await page.evaluate(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });

  await page.waitForFunction(() => Array.from(document.querySelectorAll('.sidebar button')).some(button => button.textContent?.includes('Health')), { timeout: 30_000 });
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('.sidebar button')).find(item => item.textContent?.includes('Health'));
    if (!(button instanceof HTMLButtonElement)) throw new Error('Health navigation button not found.');
    button.click();
  });
  await page.waitForSelector('.health-module-host .health-module', { timeout: 15_000 });

  // Provider + follow-up workflow.
  await clickNow('[data-health-add-provider]');
  await page.waitForSelector('.health-modal input[placeholder="Dr. Jane Smith"]', { timeout: 10_000 });
  const sixMonthsAgo = await page.evaluate(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 6);
    date.setDate(date.getDate() - 2);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  await setValueNow('.health-modal input[placeholder="Dr. Jane Smith"]', 'Dr. Live Dentist');
  await setValueNow('.health-modal select', 'Dentist');
  await page.evaluate(lastVisit => {
    const date = Array.from(document.querySelectorAll('.health-modal input')).find(input => input.type === 'date');
    if (!(date instanceof HTMLInputElement)) throw new Error('Last visit input not found.');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(date, lastVisit);
    date.dispatchEvent(new Event('input', { bubbles: true }));
    date.dispatchEvent(new Event('change', { bubbles: true }));
  }, sixMonthsAgo);
  await page.evaluate(() => {
    const save = Array.from(document.querySelectorAll('.health-modal button')).find(button => button.textContent?.trim() === 'Save provider');
    if (!(save instanceof HTMLButtonElement)) throw new Error('Save provider button missing.');
    save.click();
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.provider-card h3')).some(node => node.textContent?.includes('Dr. Live Dentist')), { timeout: 10_000 });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.health-alert strong')).some(node => node.textContent?.includes('Dentist follow-up')), { timeout: 10_000 });

  // Medication with two scheduled doses and reminders.
  await clickNow('[data-health-add-medication]');
  await page.waitForSelector('[data-health-record-modal] input[name="medication"]', { timeout: 10_000 });
  await setValueNow('[data-health-record-modal] input[name="medication"]', 'Live adherence medication');
  await setValueNow('[data-health-record-modal] input[name="directions"]', 'Take one tablet with food');
  await setValueNow('[data-health-record-modal] select[name="person"]', 'Dad');
  await setValueNow('[data-health-record-modal] input[name="startDate"]', today);
  await setValueNow('[data-health-record-modal] select[name="prescribedBy"]', 'Dr. Live Dentist');
  await setDoseTime(0, '08:00');
  await page.evaluate(() => {
    const preset = Array.from(document.querySelectorAll('.dose-preset-row button')).find(button => button.textContent?.startsWith('Evening'));
    if (!(preset instanceof HTMLButtonElement)) throw new Error('Evening dose preset missing.');
    preset.click();
  });
  await page.waitForFunction(() => document.querySelectorAll('.dose-time-control input[type="time"]').length === 2, { timeout: 5_000 });
  await setDoseTime(1, '20:00');
  const reminderChecked = await page.$eval('.medication-reminder-toggle input[type="checkbox"]', input => input.checked);
  if (!reminderChecked) throw new Error('Medication reminders should default to enabled for scheduled medication.');
  await page.evaluate(() => {
    const save = Array.from(document.querySelectorAll('[data-health-record-modal] button')).find(button => button.textContent?.trim() === 'Save medication');
    if (!(save instanceof HTMLButtonElement)) throw new Error('Save medication button missing.');
    save.click();
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-health-medication-card] h3')).some(node => node.textContent?.includes('Live adherence medication')), { timeout: 10_000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-medication-today] [data-medication-dose]').length === 2, { timeout: 10_000 });

  // Mark the first dose Taken and the second Skipped.
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-medication-today] [data-medication-dose]'));
    const taken = rows[0]?.querySelector('[data-dose-taken]');
    if (!(taken instanceof HTMLButtonElement)) throw new Error('Taken action missing for first dose.');
    taken.click();
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-medication-today] [data-medication-dose]')).some(row => row.textContent?.includes('Taken')), { timeout: 5_000 });
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-medication-today] [data-medication-dose]'));
    const skipped = rows[1]?.querySelector('[data-dose-skipped]');
    if (!(skipped instanceof HTMLButtonElement)) throw new Error('Skip action missing for second dose.');
    skipped.click();
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-medication-today] [data-medication-dose]')).some(row => row.textContent?.includes('Skipped')), { timeout: 5_000 });

  // Reopen medication and verify schedule/history survive an edit.
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('[data-health-medication-card]')).find(node => node.textContent?.includes('Live adherence medication'));
    const edit = Array.from(card?.querySelectorAll('button') ?? []).find(button => button.textContent?.trim() === 'Edit');
    if (!(edit instanceof HTMLButtonElement)) throw new Error('Medication edit button missing.');
    edit.click();
  });
  await page.waitForSelector('[data-health-record-modal] input[name="directions"]', { timeout: 10_000 });
  const editTimes = await page.$$eval('.dose-time-control input[type="time"]', inputs => inputs.map(input => input.value));
  if (editTimes.join(',') !== '08:00,20:00') throw new Error(`Medication dose times did not persist into edit mode: ${editTimes.join(',')}`);
  await setValueNow('[data-health-record-modal] input[name="directions"]', 'Take one tablet with breakfast and dinner');
  await page.evaluate(() => {
    const save = Array.from(document.querySelectorAll('[data-health-record-modal] button')).find(button => button.textContent?.trim() === 'Save changes');
    if (!(save instanceof HTMLButtonElement)) throw new Error('Medication Save changes button missing.');
    save.click();
  });
  await page.waitForFunction(() => !document.querySelector('[data-health-record-modal]'), { timeout: 10_000 });

  // Health record remains integrated with medication/provider data.
  await clickNow('[data-health-add-record]');
  await page.waitForSelector('[data-health-record-modal] select[name="entryType"]', { timeout: 10_000 });
  await setValueNow('[data-health-record-modal] select[name="entryType"]', 'Temperature');
  await setValueNow('[data-health-record-modal] input[name="value"]', '37.2');
  await setValueNow('[data-health-record-modal] input[name="unit"]', '°C');
  await setValueNow('[data-health-record-modal] select[name="person"]', 'Dad');
  await setValueNow('[data-health-record-modal] input[name="date"]', today);
  await setValueNow('[data-health-record-modal] input[name="time"]', '09:15');
  await setValueNow('[data-health-record-modal] select[name="provider"]', 'Dr. Live Dentist');
  await page.evaluate(() => {
    const save = Array.from(document.querySelectorAll('[data-health-record-modal] button')).find(button => button.textContent?.trim() === 'Save health record');
    if (!(save instanceof HTMLButtonElement)) throw new Error('Save health record button missing.');
    save.click();
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-health-entry-row] strong')).some(node => node.textContent?.includes('37.2')), { timeout: 10_000 });

  const stored = await page.evaluate(() => ({
    providers: JSON.parse(localStorage.getItem('family-os:health-providers-v1') || '[]'),
    records: JSON.parse(localStorage.getItem('family-os:capture-records-v1') || '[]'),
    adherence: JSON.parse(localStorage.getItem('family-os:medication-adherence-v1') || '{}'),
  }));

  const medication = stored.records.find(record => record.kind === 'Medication' && record.values?.medication === 'Live adherence medication');
  if (!medication) throw new Error(`Medication was not persisted: ${JSON.stringify(stored.records)}`);
  if (medication.values.doseTimes !== '08:00,20:00') throw new Error(`Medication doseTimes not persisted: ${JSON.stringify(medication.values)}`);
  if (medication.values.remindersEnabled !== 'true') throw new Error('Medication reminder setting was not persisted.');
  if (medication.values.directions !== 'Take one tablet with breakfast and dinner') throw new Error('Medication edit did not persist.');

  const schedule = stored.adherence.schedules?.find(item => item.medicationId === medication.id);
  if (!schedule || schedule.doseTimes?.join(',') !== '08:00,20:00' || schedule.remindersEnabled !== true) {
    throw new Error(`Medication adherence schedule invalid: ${JSON.stringify(stored.adherence)}`);
  }
  const doseLogs = stored.adherence.logs?.filter(item => item.medicationId === medication.id) ?? [];
  if (doseLogs.length !== 2) throw new Error(`Expected 2 dose logs, got ${JSON.stringify(doseLogs)}`);
  if (!doseLogs.some(item => item.time === '08:00' && item.status === 'taken')) throw new Error('08:00 Taken history missing.');
  if (!doseLogs.some(item => item.time === '20:00' && item.status === 'skipped')) throw new Error('20:00 Skipped history missing.');

  const healthEntry = stored.records.find(record => record.kind === 'Health entry' && record.values?.value === '37.2');
  if (!healthEntry || healthEntry.values.provider !== 'Dr. Live Dentist') throw new Error('Health entry/provider integration failed.');

  if (errors.length) throw new Error(`Browser errors during live health test:\n${errors.join('\n')}`);
  console.log('LIVE_HEALTH_SMOKE_PASS', JSON.stringify({
    url: siteUrl,
    medication: medication.values.medication,
    doseTimes: schedule.doseTimes,
    remindersEnabled: schedule.remindersEnabled,
    taken: doseLogs.filter(item => item.status === 'taken').length,
    skipped: doseLogs.filter(item => item.status === 'skipped').length,
    healthEntry: `${healthEntry.values.value} ${healthEntry.values.unit}`,
  }));
} finally {
  await browser.close();
}
