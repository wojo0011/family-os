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

  await page.evaluateOnNewDocument(() => {
    window.__familyOsGoogleMock = { requests: [], revoked: false };
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient(config) {
            return {
              requestAccessToken(options = {}) {
                window.__familyOsGoogleMock.requests.push({ scope: config.scope, prompt: options.prompt || '' });
                setTimeout(() => config.callback({
                  access_token: 'family-os-mock-access-token',
                  expires_in: 3600,
                  scope: config.scope,
                  token_type: 'Bearer',
                }), 0);
              },
            };
          },
          revoke(_token, callback) {
            window.__familyOsGoogleMock.revoked = true;
            localStorage.setItem('family-os:google-mock-revoked', 'true');
            setTimeout(() => callback?.({ successful: true }), 0);
          },
        },
      },
    };
  });

  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = request.url();
    if (url === 'https://www.googleapis.com/oauth2/v3/userinfo') {
      request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ name: 'Family OS Test', email: 'family-os-test@example.com', picture: '' }),
      });
      return;
    }
    if (url === 'https://www.googleapis.com/calendar/v3/users/me/calendarList') {
      request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
      return;
    }
    if (url.startsWith('https://www.googleapis.com/calendar/v3/calendars/')) {
      request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
      return;
    }
    request.continue();
  });

  const url = new URL(siteUrl);
  url.searchParams.set('google-auth-smoke', Date.now().toString());
  await page.goto(url.toString(), { waitUntil: 'networkidle2', timeout: 60_000 });
  await page.evaluate(() => {
    localStorage.removeItem('family-os:google-mock-revoked');
    sessionStorage.removeItem('family-os:google-account-hint-v1');
  });

  await page.waitForSelector('.topbar button.connect', { timeout: 20_000 });
  const connectText = await page.$eval('.topbar button.connect', button => button.textContent?.trim() || '');
  if (connectText === 'Google setup needed') throw new Error('VITE_GOOGLE_CLIENT_ID is not configured on the deployed build.');

  await page.click('.topbar button.connect');
  await page.waitForSelector('.google-account-host:not([hidden]) .google-account-chip', { timeout: 15_000 });
  await page.click('[data-google-account-toggle]');
  await page.waitForSelector('.google-account-menu:not([hidden])', { timeout: 5_000 });

  const accountText = await page.$eval('.google-account-menu', menu => menu.textContent || '');
  if (!accountText.includes('Family OS Test') || !accountText.includes('family-os-test@example.com')) throw new Error(`Google account identity did not render: ${accountText}`);
  if (!accountText.includes('Calendar') || !accountText.includes('Authorized')) throw new Error(`Calendar authorization state missing: ${accountText}`);

  await page.click('[data-google-scope="contacts"]');
  await page.waitForFunction(() => {
    const rows = Array.from(document.querySelectorAll('.google-scope-row'));
    return rows.some(row => row.textContent?.includes('Contacts / People') && row.textContent?.includes('Authorized'));
  }, { timeout: 10_000 });

  await page.click('[data-google-scope="drive"]');
  await page.waitForFunction(() => {
    const rows = Array.from(document.querySelectorAll('.google-scope-row'));
    return rows.some(row => row.textContent?.includes('Family Vault / Drive app data') && row.textContent?.includes('Authorized'));
  }, { timeout: 10_000 });

  const security = await page.evaluate(() => {
    const local = Object.entries(localStorage).map(([key, value]) => `${key}:${value}`).join('\n');
    const session = Object.entries(sessionStorage).map(([key, value]) => `${key}:${value}`).join('\n');
    return {
      tokenPersisted: local.includes('family-os-mock-access-token') || session.includes('family-os-mock-access-token'),
      requests: window.__familyOsGoogleMock.requests,
    };
  });
  if (security.tokenPersisted) throw new Error('Google access token was persisted to browser storage.');

  const requestedScopes = security.requests.map(item => item.scope).join(' ');
  for (const expected of [
    'openid',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/contacts',
    'https://www.googleapis.com/auth/drive.appdata',
  ]) {
    if (!requestedScopes.includes(expected)) throw new Error(`Expected Google scope was never requested: ${expected}`);
  }

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15_000 }),
    page.click('[data-google-disconnect]'),
  ]);
  const revoked = await page.evaluate(() => localStorage.getItem('family-os:google-mock-revoked'));
  if (revoked !== 'true') throw new Error('Google token revoke was not called during disconnect.');
  await page.waitForSelector('.topbar button.connect', { timeout: 10_000 });
  const accountHostHidden = await page.$eval('.google-account-host', host => host.hidden);
  if (!accountHostHidden) throw new Error('Google account UI remained connected after disconnect/reload.');

  if (errors.length) throw new Error(`Browser errors during Google auth smoke test:\n${errors.join('\n')}`);
  console.log('LIVE_GOOGLE_AUTH_SMOKE_PASS', JSON.stringify({
    url: siteUrl,
    account: 'family-os-test@example.com',
    calendarAuthorized: true,
    contactsAuthorized: true,
    driveAppDataAuthorized: true,
    tokenPersisted: false,
    revoked: true,
  }));
} finally {
  await browser.close();
}
