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
  const tomorrow = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });

  const url = new URL(siteUrl);
  url.searchParams.set('money-smoke', Date.now().toString());
  await page.goto(url.toString(), { waitUntil: 'networkidle2', timeout: 60_000 });
  await page.evaluate(() => localStorage.removeItem('family-os:capture-records-v1'));
  await page.reload({ waitUntil: 'networkidle2' });

  await page.waitForFunction(() => Array.from(document.querySelectorAll('.sidebar button')).some(button => button.textContent?.includes('Money')), { timeout: 30_000 });
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('.sidebar button')).find(item => item.textContent?.includes('Money'));
    if (!(button instanceof HTMLButtonElement)) throw new Error('Money navigation button not found.');
    button.click();
  });
  await page.waitForSelector('.money-module-host .money-module', { timeout: 15_000 });

  // Bill workflow.
  await clickNow('[data-money-add-bill]');
  await page.waitForSelector('[data-money-modal] input[name="bill"]', { timeout: 10_000 });
  await setValueNow('[data-money-modal] input[name="bill"]', 'Live Hydro');
  await setValueNow('[data-money-modal] input[name="amount"]', '187.42');
  await setValueNow('[data-money-modal] input[name="dueDate"]', tomorrow);
  await setValueNow('[data-money-modal] select[name="category"]', 'Utilities');
  await setValueNow('[data-money-modal] select[name="recurrence"]', 'Monthly');
  await setValueNow('[data-money-modal] select[name="person"]', 'Family');
  await setValueNow('[data-money-modal] select[name="autopay"]', 'Yes');
  await page.evaluate(() => {
    const save = Array.from(document.querySelectorAll('[data-money-modal] button')).find(button => button.textContent?.trim() === 'Save bill');
    if (!(save instanceof HTMLButtonElement)) throw new Error('Save bill button missing.');
    save.click();
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-money-bill-row] h3')).some(node => node.textContent?.includes('Live Hydro')), { timeout: 10_000 });

  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('[data-money-bill-row]')).find(node => node.textContent?.includes('Live Hydro'));
    const markPaid = Array.from(row?.querySelectorAll('button') ?? []).find(button => button.textContent?.includes('Mark paid'));
    if (!(markPaid instanceof HTMLButtonElement)) throw new Error('Mark paid button missing.');
    markPaid.click();
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-money-bill-row]')).some(node => node.textContent?.includes('Live Hydro') && node.textContent?.includes('Paid')), { timeout: 10_000 });

  const billId = await page.evaluate(() => {
    const records = JSON.parse(localStorage.getItem('family-os:capture-records-v1') || '[]');
    return records.find(record => record.kind === 'Bill' && record.values?.bill === 'Live Hydro')?.id || '';
  });
  if (!billId) throw new Error('Saved bill id not found.');

  // Linked receipt: should NOT increase report total.
  await clickNow('[data-money-add-receipt]');
  await page.waitForSelector('[data-money-modal] input[name="merchant"]', { timeout: 10_000 });
  await setValueNow('[data-money-modal] input[name="merchant"]', 'Hydro receipt');
  await setValueNow('[data-money-modal] input[name="amount"]', '187.42');
  await setValueNow('[data-money-modal] input[name="date"]', today);
  await setValueNow('[data-money-modal] select[name="category"]', 'Utilities');
  await setValueNow('[data-money-modal] select[name="person"]', 'Family');
  await setValueNow('[data-money-modal] select[name="paymentMethod"]', 'Bank transfer');
  await setValueNow('[data-money-modal] select[name="linkedBillId"]', billId);
  await page.evaluate(() => {
    const save = Array.from(document.querySelectorAll('[data-money-modal] button')).find(button => button.textContent?.trim() === 'Save receipt');
    if (!(save instanceof HTMLButtonElement)) throw new Error('Save receipt button missing.');
    save.click();
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-money-receipt-row] strong')).some(node => node.textContent?.includes('Hydro receipt')), { timeout: 10_000 });

  // Unlinked receipt: DOES count in report.
  await clickNow('[data-money-add-receipt]');
  await page.waitForSelector('[data-money-modal] input[name="merchant"]', { timeout: 10_000 });
  await setValueNow('[data-money-modal] input[name="merchant"]', 'Coffee receipt');
  await setValueNow('[data-money-modal] input[name="amount"]', '12.34');
  await setValueNow('[data-money-modal] input[name="date"]', today);
  await setValueNow('[data-money-modal] select[name="category"]', 'Dining');
  await setValueNow('[data-money-modal] select[name="person"]', 'Dad');
  await setValueNow('[data-money-modal] select[name="paymentMethod"]', 'Credit');
  await page.evaluate(() => {
    const save = Array.from(document.querySelectorAll('[data-money-modal] button')).find(button => button.textContent?.trim() === 'Save receipt');
    if (!(save instanceof HTMLButtonElement)) throw new Error('Save receipt button missing.');
    save.click();
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-money-receipt-row] strong')).some(node => node.textContent?.includes('Coffee receipt')), { timeout: 10_000 });

  // Standalone expense.
  await clickNow('[data-money-add-expense]');
  await page.waitForSelector('[data-money-modal] input[name="merchant"]', { timeout: 10_000 });
  await setValueNow('[data-money-modal] input[name="merchant"]', 'Live groceries');
  await setValueNow('[data-money-modal] input[name="amount"]', '50.25');
  await setValueNow('[data-money-modal] input[name="date"]', today);
  await setValueNow('[data-money-modal] select[name="category"]', 'Groceries');
  await setValueNow('[data-money-modal] select[name="person"]', 'Dad');
  await setValueNow('[data-money-modal] select[name="paymentMethod"]', 'Debit');
  await page.evaluate(() => {
    const save = Array.from(document.querySelectorAll('[data-money-modal] button')).find(button => button.textContent?.trim() === 'Save expense');
    if (!(save instanceof HTMLButtonElement)) throw new Error('Save expense button missing.');
    save.click();
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-money-expense-row] strong')).some(node => node.textContent?.includes('Live groceries')), { timeout: 10_000 });

  // Verify report semantics: 187.42 paid bill + 12.34 unlinked receipt + 50.25 expense = 250.01.
  await page.waitForFunction(() => (document.querySelector('[data-money-report]')?.textContent || '').includes('$250.01'), { timeout: 10_000 });

  // Edit bill amount and ensure report updates, proving edit + report recomputation.
  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('[data-money-bill-row]')).find(node => node.textContent?.includes('Live Hydro'));
    const edit = Array.from(row?.querySelectorAll('button') ?? []).find(button => button.textContent?.trim() === 'Edit');
    if (!(edit instanceof HTMLButtonElement)) throw new Error('Bill edit button missing.');
    edit.click();
  });
  await page.waitForSelector('[data-money-modal] input[name="amount"]', { timeout: 10_000 });
  await setValueNow('[data-money-modal] input[name="amount"]', '190.00');
  await page.evaluate(() => {
    const save = Array.from(document.querySelectorAll('[data-money-modal] button')).find(button => button.textContent?.trim() === 'Save changes');
    if (!(save instanceof HTMLButtonElement)) throw new Error('Bill Save changes button missing.');
    save.click();
  });
  await page.waitForFunction(() => (document.querySelector('[data-money-report]')?.textContent || '').includes('$252.59'), { timeout: 10_000 });

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('family-os:capture-records-v1') || '[]'));
  const bill = stored.find(record => record.kind === 'Bill' && record.values?.bill === 'Live Hydro');
  const linkedReceipt = stored.find(record => record.kind === 'Scan receipt' && record.values?.merchant === 'Hydro receipt');
  const freeReceipt = stored.find(record => record.kind === 'Scan receipt' && record.values?.merchant === 'Coffee receipt');
  const expense = stored.find(record => record.kind === 'Expense' && record.values?.merchant === 'Live groceries');

  if (!bill || bill.values.status !== 'Paid' || bill.values.amount !== '190.00' || !bill.values.paidDate) throw new Error(`Bill did not persist correctly: ${JSON.stringify(bill)}`);
  if (!linkedReceipt || linkedReceipt.values.linkedBillId !== bill.id) throw new Error(`Linked receipt did not persist bill link: ${JSON.stringify(linkedReceipt)}`);
  if (!freeReceipt || freeReceipt.values.amount !== '12.34') throw new Error('Unlinked receipt missing.');
  if (!expense || expense.values.amount !== '50.25') throw new Error('Expense missing.');
  if (!document.querySelector('[data-money-report]')) throw new Error('Money report is missing.');
  if (errors.length) throw new Error(`Browser errors during live money test:\n${errors.join('\n')}`);

  console.log('LIVE_MONEY_SMOKE_PASS', JSON.stringify({
    url: siteUrl,
    bill: bill.values.bill,
    paidAmount: bill.values.amount,
    linkedReceiptExcluded: linkedReceipt.values.amount,
    unlinkedReceipt: freeReceipt.values.amount,
    expense: expense.values.amount,
    expectedReportTotal: '252.59',
  }));
} finally {
  await browser.close();
}
