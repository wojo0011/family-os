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
  page.on('dialog', async dialog => dialog.accept());

  const clickNow = selector => page.evaluate(value => {
    const element = document.querySelector(value);
    if (!(element instanceof HTMLElement)) throw new Error(`Element not found for click: ${value}`);
    element.click();
  }, selector);

  const setValueNow = (selector, value) => page.evaluate(({ selector: currentSelector, value: currentValue }) => {
    const element = document.querySelector(currentSelector);
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) throw new Error(`Form control not found: ${currentSelector}`);
    const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(element, currentValue);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, { selector, value });

  const setProfileField = (label, value) => page.evaluate(({ label: wantedLabel, value: currentValue }) => {
    const labels = Array.from(document.querySelectorAll('[data-pet-modal] .pet-form-grid label'));
    const wrapper = labels.find(item => item.querySelector(':scope > span')?.textContent?.trim() === wantedLabel);
    const element = wrapper?.querySelector('input, textarea, select');
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) throw new Error(`Pet profile field not found: ${wantedLabel}`);
    const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(element, currentValue);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, { label, value });

  const today = await page.evaluate(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
  const nextYear = await page.evaluate(() => {
    const d = new Date(); d.setFullYear(d.getFullYear()+1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });

  const url = new URL(siteUrl); url.searchParams.set('pet-smoke', Date.now().toString());
  await page.goto(url.toString(), { waitUntil: 'networkidle2', timeout: 60_000 });
  await page.evaluate(() => {
    localStorage.removeItem('family-os:pet-profiles-v1');
    const records = JSON.parse(localStorage.getItem('family-os:capture-records-v1') || '[]').filter(record => record.kind !== 'Pet record');
    localStorage.setItem('family-os:capture-records-v1', JSON.stringify(records));
  });
  await page.reload({ waitUntil: 'networkidle2' });

  await page.waitForFunction(() => Array.from(document.querySelectorAll('.sidebar button')).some(button => button.textContent?.includes('Pets')), { timeout: 30_000 });
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('.sidebar button')).find(item => item.textContent?.includes('Pets'));
    if (!(button instanceof HTMLButtonElement)) throw new Error('Pets navigation button missing.');
    button.click();
  });
  await page.waitForSelector('.pet-module-host .pet-module', { timeout: 15_000 });

  await clickNow('[data-pet-add]');
  await page.waitForSelector('[data-pet-modal]');
  const profileValues = [
    ['Name', 'Live Max'], ['Species', 'Dog'], ['Breed', 'Labrador Retriever'], ['Status', 'Active'], ['Sex', 'Male'], ['Family member', 'Family'],
    ['Birthday', '2021-05-10'], ['Adoption date', '2021-07-01'], ['Colour / markings', 'Black'], ['Weight (kg)', '31.4'],
    ['Microchip', 'MICROCHIP-LIVE-7788'], ['Licence / tag', 'DOG-LIVE-22'], ['Veterinarian', 'Live Animal Hospital'], ['Vet phone', '905-555-0100'],
    ['Insurance provider', 'Live Pet Insurance'], ['Policy', 'PET-12345'], ['Insurance expiry', nextYear], ['Allergies', 'Chicken'],
    ['Conditions', 'Seasonal allergies'], ['Notes', 'Friendly family dog'],
  ];
  for (const [label, value] of profileValues) await setProfileField(label, value);
  await clickNow('[data-pet-save]');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-pet-card] h3')).some(node => node.textContent?.includes('Live Max')), { timeout: 10_000 });

  await setValueNow('[data-pet-search]', 'MICROCHIP-LIVE-7788');
  await page.waitForFunction(() => document.querySelectorAll('[data-pet-card]').length === 1 && (document.querySelector('[data-pet-card]')?.textContent || '').includes('Live Max'));
  await setValueNow('[data-pet-search]', '');

  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('[data-pet-card]')).find(node => node.textContent?.includes('Live Max'));
    const edit = Array.from(card?.querySelectorAll('button') || []).find(button => button.textContent?.trim() === 'Edit profile');
    if (!(edit instanceof HTMLButtonElement)) throw new Error('Pet edit button missing.'); edit.click();
  });
  await page.waitForSelector('[data-pet-modal]');
  await setProfileField('Name', 'Max Family Dog');
  await setProfileField('Status', 'Needs care');
  await clickNow('[data-pet-save]');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-pet-card] h3')).some(node => node.textContent?.includes('Max Family Dog')));

  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('[data-pet-card]')).find(node => node.textContent?.includes('Max Family Dog'));
    const add = card?.querySelector('[data-pet-card-record]'); if (!(add instanceof HTMLButtonElement)) throw new Error('Pet care button missing.'); add.click();
  });
  await page.waitForSelector('[data-pet-record-modal] select[name="recordType"]');
  await setValueNow('[data-pet-record-modal] select[name="recordType"]', 'Vaccination');
  await setValueNow('[data-pet-record-modal] input[name="date"]', today);
  await setValueNow('[data-pet-record-modal] input[name="provider"]', 'Live Animal Hospital');
  await setValueNow('[data-pet-record-modal] input[name="value"]', 'Rabies');
  await setValueNow('[data-pet-record-modal] input[name="cost"]', '85.50');
  await setValueNow('[data-pet-record-modal] input[name="nextDue"]', nextYear);
  await setValueNow('[data-pet-record-modal] textarea[name="notes"]', 'Rabies vaccination completed');
  await clickNow('[data-pet-record-save]');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-pet-history-row]')).some(node => node.textContent?.includes('Vaccination') && node.textContent?.includes('Max Family Dog')));

  await clickNow('[data-pet-add-record]');
  await page.waitForSelector('[data-pet-record-modal] select[name="recordType"]');
  await setValueNow('[data-pet-record-modal] select[name="recordType"]', 'Weight');
  await setValueNow('[data-pet-record-modal] input[name="date"]', today);
  await setValueNow('[data-pet-record-modal] input[name="value"]', '32.1');
  await setValueNow('[data-pet-record-modal] textarea[name="notes"]', 'Routine weigh-in');
  await clickNow('[data-pet-record-save]');
  await page.waitForFunction(() => (document.querySelector('[data-pet-card]')?.textContent || '').includes('32.1 kg'));

  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('[data-pet-history-row]')).find(node => node.textContent?.includes('Vaccination'));
    const edit = Array.from(row?.querySelectorAll('button') || []).find(button => button.textContent?.trim() === 'Edit');
    if (!(edit instanceof HTMLButtonElement)) throw new Error('Pet history edit missing.'); edit.click();
  });
  await page.waitForSelector('[data-pet-record-modal] textarea[name="notes"]');
  await setValueNow('[data-pet-record-modal] textarea[name="notes"]', 'Rabies vaccination completed and certificate received');
  await clickNow('[data-pet-record-save]');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-pet-history-row]')).some(node => node.textContent?.includes('certificate received')));

  const petId = await page.evaluate(() => JSON.parse(localStorage.getItem('family-os:pet-profiles-v1') || '[]')[0]?.id || '');
  if (!petId) throw new Error('Pet profile id missing.');
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('[data-pet-card]')).find(node => node.textContent?.includes('Max Family Dog'));
    const edit = Array.from(card?.querySelectorAll('button') || []).find(button => button.textContent?.trim() === 'Edit profile');
    if (!(edit instanceof HTMLButtonElement)) throw new Error('Pet profile edit missing before delete.'); edit.click();
  });
  await page.waitForSelector('[data-pet-modal] .pet-danger');
  await clickNow('[data-pet-modal] .pet-danger');
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('[data-pet-card] h3')).some(node => node.textContent?.includes('Max Family Dog')));

  const result = await page.evaluate(id => {
    const pets = JSON.parse(localStorage.getItem('family-os:pet-profiles-v1') || '[]');
    const records = JSON.parse(localStorage.getItem('family-os:capture-records-v1') || '[]').filter(record => record.kind === 'Pet record' && record.values?.petId === id);
    return { deleted: !pets.some(pet => pet.id === id), records };
  }, petId);
  if (!result.deleted) throw new Error('Pet profile was not deleted.');
  if (result.records.length < 2) throw new Error(`Pet history was not preserved: ${JSON.stringify(result.records)}`);
  const vaccine = result.records.find(record => record.values.recordType === 'Vaccination');
  const weight = result.records.find(record => record.values.recordType === 'Weight');
  if (!vaccine?.values.notes?.includes('certificate received')) throw new Error('Edited vaccination record did not persist.');
  if (weight?.values.value !== '32.1') throw new Error('Weight record did not persist.');
  if (errors.length) throw new Error(`Browser errors during live pet test:\n${errors.join('\n')}`);

  console.log('LIVE_PET_SMOKE_PASS', JSON.stringify({ url: siteUrl, petDeleted: true, historyPreserved: true, petId, microchip: 'MICROCHIP-LIVE-7788', latestWeight: weight.values.value, vaccination: vaccine.values.value, editedNotes: vaccine.values.notes }));
} finally { await browser.close(); }
