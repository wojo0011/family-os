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

  const today = await page.evaluate(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const nextYear = await page.evaluate(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });

  const url = new URL(siteUrl);
  url.searchParams.set('vehicle-smoke', Date.now().toString());
  await page.goto(url.toString(), { waitUntil: 'networkidle2', timeout: 60_000 });
  await page.evaluate(() => {
    localStorage.removeItem('family-os:vehicle-profiles-v1');
    localStorage.removeItem('family-os:capture-records-v1');
  });
  await page.reload({ waitUntil: 'networkidle2' });

  await page.waitForFunction(() => Array.from(document.querySelectorAll('.sidebar button')).some(button => button.textContent?.includes('Vehicles')), { timeout: 30_000 });
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('.sidebar button')).find(item => item.textContent?.includes('Vehicles'));
    if (!(button instanceof HTMLButtonElement)) throw new Error('Vehicles navigation button not found.');
    button.click();
  });
  await page.waitForSelector('.vehicle-module-host .vehicle-module', { timeout: 15_000 });

  // CREATE a durable vehicle profile.
  await clickNow('[data-vehicle-add]');
  await page.waitForSelector('[data-vehicle-modal] input[placeholder="Family Jetta"]', { timeout: 10_000 });
  const fields = {
    '[data-vehicle-modal] input[placeholder="Family Jetta"]': 'Live Jetta',
    '[data-vehicle-modal] input[placeholder="Volkswagen"]': 'Volkswagen',
    '[data-vehicle-modal] input[placeholder="Jetta"]': 'Jetta',
    '[data-vehicle-modal] input[placeholder="TDI Highline"]': 'TDI Highline',
    '[data-vehicle-vin]': '3VWLL7AJ5FM123456',
    '[data-vehicle-modal] input[placeholder="ABC123"]': 'LIVE123',
    '[data-vehicle-modal] input[placeholder="205/55R16"]': '205/55R16',
  };
  for (const [selector, value] of Object.entries(fields)) await setValueNow(selector, value);
  await page.evaluate(({ today, nextYear }) => {
    const modal = document.querySelector('[data-vehicle-modal]');
    if (!modal) throw new Error('Vehicle modal missing.');
    const inputs = Array.from(modal.querySelectorAll('input'));
    const year = inputs.find(input => input.inputMode === 'numeric');
    const odometer = inputs.find(input => input.type === 'number' && !input.step);
    const dates = inputs.filter(input => input.type === 'date');
    if (year) { year.value = '2015'; year.dispatchEvent(new Event('input', { bubbles: true })); }
    if (odometer) { odometer.value = '180000'; odometer.dispatchEvent(new Event('input', { bubbles: true })); }
    if (dates[0]) { dates[0].value = today; dates[0].dispatchEvent(new Event('input', { bubbles: true })); }
    if (dates[1]) { dates[1].value = nextYear; dates[1].dispatchEvent(new Event('input', { bubbles: true })); }
    if (dates[2]) { dates[2].value = nextYear; dates[2].dispatchEvent(new Event('input', { bubbles: true })); }
  }, { today, nextYear });
  await setValueNow('[data-vehicle-modal] select', 'Active');
  await clickNow('[data-vehicle-save]');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-vehicle-card] h3')).some(node => node.textContent?.includes('Live Jetta')), { timeout: 10_000 });

  const vehicleId = await page.evaluate(() => {
    const profiles = JSON.parse(localStorage.getItem('family-os:vehicle-profiles-v1') || '[]');
    return profiles.find(vehicle => vehicle.nickname === 'Live Jetta')?.id || '';
  });
  if (!vehicleId) throw new Error('Vehicle profile was not persisted.');

  // SEARCH by VIN.
  await setValueNow('[data-vehicle-search]', '3VWLL7AJ5FM123456');
  await page.waitForFunction(() => {
    const cards = Array.from(document.querySelectorAll('[data-vehicle-card]'));
    return cards.length === 1 && cards[0].textContent?.includes('Live Jetta');
  }, { timeout: 10_000 });
  await setValueNow('[data-vehicle-search]', '');

  // UPDATE the vehicle profile.
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('[data-vehicle-card]')).find(node => node.textContent?.includes('Live Jetta'));
    const edit = Array.from(card?.querySelectorAll('button') ?? []).find(button => button.textContent?.trim() === 'Edit profile');
    if (!(edit instanceof HTMLButtonElement)) throw new Error('Vehicle edit button missing.');
    edit.click();
  });
  await page.waitForSelector('[data-vehicle-modal]', { timeout: 10_000 });
  await page.evaluate(() => {
    const modal = document.querySelector('[data-vehicle-modal]');
    if (!modal) throw new Error('Edit vehicle modal missing.');
    const selects = Array.from(modal.querySelectorAll('select'));
    const status = selects.find(select => Array.from(select.options).some(option => option.value === 'Needs service'));
    if (!(status instanceof HTMLSelectElement)) throw new Error('Vehicle status selector missing.');
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(status, 'Needs service');
    status.dispatchEvent(new Event('input', { bubbles: true }));
    status.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await setValueNow('[data-vehicle-vin]', '3VWLL7AJ5FM123456');
  await clickNow('[data-vehicle-save]');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-vehicle-card]')).some(node => node.textContent?.includes('Live Jetta') && node.textContent?.includes('Needs service')), { timeout: 10_000 });

  // CREATE service history and verify odometer rolls forward on the profile.
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('[data-vehicle-card]')).find(node => node.textContent?.includes('Live Jetta'));
    const add = Array.from(card?.querySelectorAll('button') ?? []).find(button => button.textContent?.includes('Service / update'));
    if (!(add instanceof HTMLButtonElement)) throw new Error('Vehicle service button missing.');
    add.click();
  });
  await page.waitForSelector('[data-vehicle-update-modal] form', { timeout: 10_000 });
  await setValueNow('[data-vehicle-update-modal] select[name="vehicleId"]', vehicleId);
  await setValueNow('[data-vehicle-update-modal] select[name="updateType"]', 'Service');
  await setValueNow('[data-vehicle-update-modal] input[name="date"]', today);
  await setValueNow('[data-vehicle-update-modal] input[name="odometer"]', '181250');
  await setValueNow('[data-vehicle-update-modal] input[name="cost"]', '349.95');
  await setValueNow('[data-vehicle-update-modal] input[name="provider"]', 'Live VW Shop');
  await setValueNow('[data-vehicle-update-modal] input[name="nextServiceOdometer"]', '191250');
  await setValueNow('[data-vehicle-update-modal] textarea[name="notes"]', 'Oil and filter service');
  await clickNow('[data-vehicle-save-update]');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-vehicle-history-row]')).some(node => node.textContent?.includes('Live VW Shop')), { timeout: 10_000 });

  // UPDATE service history.
  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('[data-vehicle-history-row]')).find(node => node.textContent?.includes('Live VW Shop'));
    const edit = Array.from(row?.querySelectorAll('button') ?? []).find(button => button.textContent?.trim() === 'Edit');
    if (!(edit instanceof HTMLButtonElement)) throw new Error('Service history edit button missing.');
    edit.click();
  });
  await page.waitForSelector('[data-vehicle-update-modal] textarea[name="notes"]', { timeout: 10_000 });
  await setValueNow('[data-vehicle-update-modal] textarea[name="notes"]', 'Oil, filter and inspection completed');
  await clickNow('[data-vehicle-save-update]');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-vehicle-history-row]')).some(node => node.textContent?.includes('inspection completed')), { timeout: 10_000 });

  // DELETE profile. Historical service record must remain.
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('[data-vehicle-card]')).find(node => node.textContent?.includes('Live Jetta'));
    const edit = Array.from(card?.querySelectorAll('button') ?? []).find(button => button.textContent?.trim() === 'Edit profile');
    if (!(edit instanceof HTMLButtonElement)) throw new Error('Vehicle edit button missing before delete.');
    edit.click();
  });
  await page.waitForSelector('[data-vehicle-modal] .vehicle-danger', { timeout: 10_000 });
  page.once('dialog', dialog => dialog.accept());
  await clickNow('[data-vehicle-modal] .vehicle-danger');
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('[data-vehicle-card] h3')).some(node => node.textContent?.includes('Live Jetta')), { timeout: 10_000 });

  const stored = await page.evaluate(() => ({
    profiles: JSON.parse(localStorage.getItem('family-os:vehicle-profiles-v1') || '[]'),
    records: JSON.parse(localStorage.getItem('family-os:capture-records-v1') || '[]'),
  }));
  if (stored.profiles.some(vehicle => vehicle.id === vehicleId)) throw new Error('Vehicle profile delete did not persist.');
  const history = stored.records.find(record => record.kind === 'Vehicle update' && record.values?.vehicleId === vehicleId);
  if (!history) throw new Error(`Vehicle history was lost when profile was deleted: ${JSON.stringify(stored.records)}`);
  if (history.values.odometer !== '181250') throw new Error(`Vehicle history odometer incorrect: ${JSON.stringify(history.values)}`);
  if (history.values.notes !== 'Oil, filter and inspection completed') throw new Error('Vehicle history edit did not persist.');

  if (errors.length) throw new Error(`Browser errors during live vehicle test:\n${errors.join('\n')}`);

  console.log('LIVE_VEHICLE_SMOKE_PASS', JSON.stringify({
    url: siteUrl,
    vehicleDeleted: true,
    historyPreserved: true,
    vehicleId,
    serviceOdometer: history.values.odometer,
    serviceProvider: history.values.provider,
    editedNotes: history.values.notes,
    searchKey: '3VWLL7AJ5FM123456',
  }));
} finally {
  await browser.close();
}
