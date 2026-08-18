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
  page.on('dialog', dialog => void dialog.accept());

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
  const tomorrow = await page.evaluate(() => {
    const date = new Date(); date.setDate(date.getDate() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const nextYear = await page.evaluate(() => {
    const date = new Date(); date.setFullYear(date.getFullYear() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });

  const url = new URL(siteUrl);
  url.searchParams.set('home-smoke', Date.now().toString());
  await page.goto(url.toString(), { waitUntil: 'networkidle2', timeout: 60_000 });
  await page.evaluate(() => localStorage.removeItem('family-os:capture-records-v1'));
  await page.reload({ waitUntil: 'networkidle2' });

  await page.waitForFunction(() => Array.from(document.querySelectorAll('.sidebar button')).some(button => button.textContent?.includes('Home')), { timeout: 30_000 });
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('.sidebar button')).find(item => item.textContent?.includes('Home'));
    if (!(button instanceof HTMLButtonElement)) throw new Error('Home navigation button not found.');
    button.click();
  });
  await page.waitForSelector('.home-module-host .home-module', { timeout: 15_000 });

  // CREATE: maintenance.
  await clickNow('[data-home-add-maintenance]');
  await page.waitForSelector('[data-home-modal] input[name="task"]', { timeout: 10_000 });
  await setValueNow('[data-home-modal] input[name="task"]', 'Live furnace filter');
  await setValueNow('[data-home-modal] select[name="area"]', 'HVAC');
  await setValueNow('[data-home-modal] input[name="date"]', tomorrow);
  await setValueNow('[data-home-modal] select[name="repeat"]', 'Every 3 months');
  await setValueNow('[data-home-modal] select[name="status"]', 'Scheduled');
  await setValueNow('[data-home-modal] input[name="provider"]', 'Live HVAC');
  await setValueNow('[data-home-modal] input[name="cost"]', '24.99');
  await page.evaluate(() => {
    const save = Array.from(document.querySelectorAll('[data-home-modal] button')).find(button => button.textContent?.trim() === 'Save record');
    if (!(save instanceof HTMLButtonElement)) throw new Error('Save maintenance button missing.');
    save.click();
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-home-maintenance-row] h3')).some(node => node.textContent?.includes('Live furnace filter')), { timeout: 10_000 });

  // CREATE: safety.
  await clickNow('[data-home-add-safety]');
  await page.waitForSelector('[data-home-modal] input[name="item"]', { timeout: 10_000 });
  await setValueNow('[data-home-modal] input[name="item"]', 'Live hallway smoke alarm');
  await setValueNow('[data-home-modal] select[name="safetyType"]', 'Smoke alarm');
  await setValueNow('[data-home-modal] input[name="location"]', 'Upstairs hallway');
  await setValueNow('[data-home-modal] select[name="status"]', 'OK');
  await setValueNow('[data-home-modal] input[name="lastChecked"]', today);
  await setValueNow('[data-home-modal] input[name="nextDue"]', tomorrow);
  await setValueNow('[data-home-modal] input[name="model"]', 'MODEL-LIVE-SAFE');
  await page.evaluate(() => {
    const save = Array.from(document.querySelectorAll('[data-home-modal] button')).find(button => button.textContent?.trim() === 'Save record');
    if (!(save instanceof HTMLButtonElement)) throw new Error('Save safety button missing.');
    save.click();
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-home-safety-row] h3')).some(node => node.textContent?.includes('Live hallway smoke alarm')), { timeout: 10_000 });

  // CREATE: appliance.
  await clickNow('[data-home-add-appliance]');
  await page.waitForSelector('[data-home-modal] input[name="appliance"]', { timeout: 10_000 });
  await setValueNow('[data-home-modal] input[name="appliance"]', 'Live refrigerator');
  await setValueNow('[data-home-modal] select[name="applianceType"]', 'Refrigerator');
  await setValueNow('[data-home-modal] input[name="location"]', 'Kitchen');
  await setValueNow('[data-home-modal] select[name="status"]', 'Active');
  await setValueNow('[data-home-modal] input[name="brand"]', 'LG');
  await setValueNow('[data-home-modal] input[name="model"]', 'LRF-LIVE');
  await setValueNow('[data-home-modal] input[name="serial"]', 'SERIAL-123-LIVE');
  await setValueNow('[data-home-modal] input[name="purchaseDate"]', today);
  await setValueNow('[data-home-modal] input[name="warrantyEnd"]', nextYear);
  await setValueNow('[data-home-modal] input[name="retailer"]', 'Live Appliance Store');
  await setValueNow('[data-home-modal] input[name="cost"]', '1499.99');
  await setValueNow('[data-home-modal] input[name="serviceProvider"]', 'Live Appliance Repair');
  await setValueNow('[data-home-modal] input[name="servicePhone"]', '905-555-0199');
  await setValueNow('[data-home-modal] input[name="manual"]', 'manual-live.pdf');
  await page.evaluate(() => {
    const save = Array.from(document.querySelectorAll('[data-home-modal] button')).find(button => button.textContent?.trim() === 'Save record');
    if (!(save instanceof HTMLButtonElement)) throw new Error('Save appliance button missing.');
    save.click();
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-home-appliance-row] h3')).some(node => node.textContent?.includes('Live refrigerator')), { timeout: 10_000 });

  // SEARCH across all three record types.
  await setValueNow('[data-home-search]', 'SERIAL-123-LIVE');
  await page.waitForFunction(() => document.querySelectorAll('[data-home-appliance-row]').length === 1 && document.querySelectorAll('[data-home-maintenance-row]').length === 0 && document.querySelectorAll('[data-home-safety-row]').length === 0, { timeout: 10_000 });
  await setValueNow('[data-home-search]', '');
  await page.waitForFunction(() => document.querySelectorAll('[data-home-maintenance-row]').length === 1 && document.querySelectorAll('[data-home-safety-row]').length === 1 && document.querySelectorAll('[data-home-appliance-row]').length === 1, { timeout: 10_000 });

  // UPDATE appliance details.
  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('[data-home-appliance-row]')).find(node => node.textContent?.includes('Live refrigerator'));
    const edit = Array.from(row?.querySelectorAll('button') ?? []).find(button => button.textContent?.trim() === 'Edit');
    if (!(edit instanceof HTMLButtonElement)) throw new Error('Appliance edit button missing.');
    edit.click();
  });
  await page.waitForSelector('[data-home-modal] input[name="model"]', { timeout: 10_000 });
  await setValueNow('[data-home-modal] input[name="model"]', 'LRF-LIVE-EDITED');
  await setValueNow('[data-home-modal] select[name="status"]', 'Needs service');
  await page.evaluate(() => {
    const save = Array.from(document.querySelectorAll('[data-home-modal] button')).find(button => button.textContent?.trim() === 'Save changes');
    if (!(save instanceof HTMLButtonElement)) throw new Error('Save appliance changes button missing.');
    save.click();
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-home-appliance-row]')).some(node => node.textContent?.includes('LRF-LIVE-EDITED') && node.textContent?.includes('Needs service')), { timeout: 10_000 });

  // UPDATE maintenance status using quick action.
  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('[data-home-maintenance-row]')).find(node => node.textContent?.includes('Live furnace filter'));
    const complete = Array.from(row?.querySelectorAll('button') ?? []).find(button => button.textContent?.includes('Complete'));
    if (!(complete instanceof HTMLButtonElement)) throw new Error('Complete maintenance button missing.');
    complete.click();
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-home-maintenance-row]')).some(node => node.textContent?.includes('Live furnace filter') && node.textContent?.includes('Completed')), { timeout: 10_000 });

  // DELETE safety record.
  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('[data-home-safety-row]')).find(node => node.textContent?.includes('Live hallway smoke alarm'));
    const remove = Array.from(row?.querySelectorAll('button') ?? []).find(button => button.textContent?.trim() === 'Remove');
    if (!(remove instanceof HTMLButtonElement)) throw new Error('Safety remove button missing.');
    remove.click();
  });
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('[data-home-safety-row]')).some(node => node.textContent?.includes('Live hallway smoke alarm')), { timeout: 10_000 });

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('family-os:capture-records-v1') || '[]'));
  const maintenanceRecord = stored.find(record => record.kind === 'Home maintenance' && record.values?.task === 'Live furnace filter');
  const appliance = stored.find(record => record.kind === 'Appliance' && record.values?.appliance === 'Live refrigerator');
  const safetyRecord = stored.find(record => record.kind === 'Safety record' && record.values?.item === 'Live hallway smoke alarm');

  if (!maintenanceRecord || maintenanceRecord.values.status !== 'Completed' || !maintenanceRecord.values.completedDate) throw new Error(`Maintenance update did not persist: ${JSON.stringify(maintenanceRecord)}`);
  if (!appliance || appliance.values.model !== 'LRF-LIVE-EDITED' || appliance.values.status !== 'Needs service' || appliance.values.serial !== 'SERIAL-123-LIVE') throw new Error(`Appliance edit did not persist: ${JSON.stringify(appliance)}`);
  if (safetyRecord) throw new Error('Safety record was not removed from local storage.');
  if (errors.length) throw new Error(`Browser errors during live Home test:\n${errors.join('\n')}`);

  console.log('LIVE_HOME_SMOKE_PASS', JSON.stringify({
    url: siteUrl,
    maintenance: maintenanceRecord.values.task,
    maintenanceStatus: maintenanceRecord.values.status,
    appliance: appliance.values.appliance,
    applianceModel: appliance.values.model,
    applianceStatus: appliance.values.status,
    safetyRemoved: true,
    searchKey: appliance.values.serial,
  }));
} finally {
  await browser.close();
}
