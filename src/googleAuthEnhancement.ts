import {
  GOOGLE_CALENDAR_SCOPES,
  GOOGLE_CONTACTS_SCOPE,
  GOOGLE_DRIVE_APPDATA_SCOPE,
  disconnectGoogle,
  getGoogleAuthState,
  hasGoogleScope,
  installGoogleAuthCapture,
  requestAdditionalGoogleScopes,
  subscribeGoogleAuth,
  type GoogleAuthState,
} from './googleAuth';

let installed = false;
let host: HTMLElement | null = null;
let connectButton: HTMLButtonElement | null = null;
let menuOpen = false;
let captureReady = false;
let captureFailed = false;
let alignFrame: number | null = null;
let timer: number | null = null;
let unsubscribe: (() => void) | null = null;
let state = getGoogleAuthState();

const clientConfigured = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim());

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character));
}

function accountInitial(auth: GoogleAuthState) {
  const source = auth.account?.name || auth.account?.email || 'G';
  return source.trim().charAt(0).toUpperCase() || 'G';
}

function accountLabel(auth: GoogleAuthState) {
  const source = auth.account?.name || auth.account?.email || 'Google';
  const first = source.trim().split(/\s+/)[0] || 'Google';
  return first.length > 14 ? `${first.slice(0, 13)}…` : first;
}

function expiryLabel(auth: GoogleAuthState) {
  if (!auth.expiresAt) return 'Reconnect when Google access expires.';
  const minutes = Math.max(0, Math.ceil((auth.expiresAt - Date.now()) / 60_000));
  if (minutes <= 1) return 'Access expires in about a minute.';
  return `Access expires in about ${minutes} minutes.`;
}

function capability(label: string, granted: boolean, action?: string) {
  return `<div class="google-scope-row"><div><strong>${escapeHtml(label)}</strong><small>${granted ? 'Authorized' : 'Not authorized'}</small></div>${granted ? '<span class="google-scope-ok">✓</span>' : action ? `<button type="button" data-google-scope="${action}">Enable</button>` : '<span>—</span>'}</div>`;
}

function renderHost() {
  if (!host) return;
  const connected = state.status === 'connected';
  host.hidden = !connected;
  if (!connected) {
    host.innerHTML = '';
    return;
  }

  const picture = state.account?.picture
    ? `<img src="${escapeHtml(state.account.picture)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="google-account-initial">${escapeHtml(accountInitial(state))}</span>`;
  const calendarGranted = GOOGLE_CALENDAR_SCOPES.every(scope => hasGoogleScope(scope));
  const contactsGranted = hasGoogleScope(GOOGLE_CONTACTS_SCOPE);
  const driveGranted = hasGoogleScope(GOOGLE_DRIVE_APPDATA_SCOPE);

  host.innerHTML = `<button type="button" class="google-account-chip" data-google-account-toggle aria-expanded="${menuOpen}">${picture}<span><strong>${escapeHtml(accountLabel(state))}</strong><small>Google</small></span><b>⌄</b></button>
    <section class="google-account-menu" ${menuOpen ? '' : 'hidden'}>
      <header>${picture}<div><strong>${escapeHtml(state.account?.name || 'Google account')}</strong><small>${escapeHtml(state.account?.email || 'Connected')}</small></div></header>
      <div class="google-token-note">🔐 Access token is kept in memory only. ${escapeHtml(expiryLabel(state))}</div>
      <div class="google-scope-list">
        ${capability('Calendar', calendarGranted)}
        ${capability('Contacts / People', contactsGranted, 'contacts')}
        ${capability('Family Vault / Drive app data', driveGranted, 'drive')}
      </div>
      ${state.error ? `<p class="google-account-error">${escapeHtml(state.error)}</p>` : ''}
      <footer><button type="button" data-google-disconnect>Disconnect Google</button></footer>
    </section>`;
  alignHost();
}

function restoreConnectButton() {
  if (!connectButton) return;
  connectButton.style.visibility = '';
  connectButton.disabled = false;

  if (!clientConfigured) {
    connectButton.textContent = 'Google setup needed';
    return;
  }
  if (state.status === 'connecting') {
    connectButton.textContent = 'Connecting…';
    connectButton.disabled = true;
  } else if (state.status === 'expired') {
    connectButton.textContent = 'Reconnect Google';
    connectButton.title = 'The in-memory Google access token expired. Reconnect to continue.';
  } else if (state.status === 'error') {
    connectButton.textContent = 'Retry Google';
    connectButton.title = state.error || 'Google authorization failed.';
  } else {
    connectButton.textContent = 'Connect Google';
    connectButton.title = '';
  }
}

function applyState(next: GoogleAuthState) {
  state = next;
  if (state.status === 'connected') {
    if (connectButton) {
      connectButton.style.visibility = 'hidden';
      connectButton.disabled = false;
    }
  } else {
    menuOpen = false;
    restoreConnectButton();
  }
  renderHost();
}

function alignHost() {
  if (!host || !connectButton || host.hidden) return;
  if (alignFrame != null) cancelAnimationFrame(alignFrame);
  alignFrame = requestAnimationFrame(() => {
    alignFrame = null;
    if (!host || !connectButton || host.hidden) return;
    const rect = connectButton.getBoundingClientRect();
    host.style.top = `${Math.max(6, rect.top)}px`;
    host.style.left = `${rect.left}px`;
    host.style.width = `${rect.width}px`;
    host.style.height = `${rect.height}px`;
  });
}

function findConnectButton() {
  const next = document.querySelector<HTMLButtonElement>('.topbar button.connect');
  if (!next) return false;
  connectButton = next;
  if (state.status === 'connected') connectButton.style.visibility = 'hidden';
  else restoreConnectButton();
  alignHost();
  return true;
}

async function enableScope(kind: 'contacts' | 'drive') {
  const scopes = kind === 'contacts' ? [GOOGLE_CONTACTS_SCOPE] : [GOOGLE_DRIVE_APPDATA_SCOPE];
  try {
    await requestAdditionalGoogleScopes(scopes);
  } catch (error) {
    console.warn(`Family OS could not enable Google ${kind} permission.`, error);
  }
}

function bindEvents() {
  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const toggle = target.closest('[data-google-account-toggle]');
    if (toggle) {
      menuOpen = !menuOpen;
      renderHost();
      return;
    }

    const scope = target.closest<HTMLButtonElement>('[data-google-scope]')?.dataset.googleScope;
    if (scope === 'contacts' || scope === 'drive') {
      void enableScope(scope);
      return;
    }

    if (target.closest('[data-google-disconnect]')) {
      void disconnectGoogle();
      return;
    }

    if (menuOpen && !target.closest('.google-account-menu')) {
      menuOpen = false;
      renderHost();
    }
  });

  // Lazy-load GIS only when the user explicitly connects. Once loaded, the existing
  // App Calendar flow receives the same token while this service captures lifecycle state.
  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest<HTMLButtonElement>('.topbar button.connect');
    if (!button || captureReady || captureFailed || !clientConfigured) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    button.textContent = 'Loading Google…';
    button.disabled = true;
    void installGoogleAuthCapture().then(() => {
      captureReady = true;
      button.disabled = false;
      button.click();
    }).catch(error => {
      captureFailed = true;
      button.disabled = false;
      button.textContent = 'Connect Google';
      console.warn('Family OS Google auth capture could not initialize.', error);
      button.click();
    });
  }, true);

  window.addEventListener('resize', alignHost);
  window.addEventListener('scroll', alignHost, true);
}

export function installGoogleAuthEnhancement() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  host = document.createElement('div');
  host.className = 'google-account-host';
  host.hidden = true;
  document.body.appendChild(host);

  findConnectButton();
  bindEvents();
  unsubscribe = subscribeGoogleAuth(applyState);

  const observer = new MutationObserver(() => {
    if (!connectButton?.isConnected) findConnectButton();
    else if (state.status !== 'connected') restoreConnectButton();
    alignHost();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  timer = window.setInterval(() => {
    if (state.status === 'connected' && menuOpen) renderHost();
  }, 30_000);

  window.addEventListener('beforeunload', () => {
    unsubscribe?.();
    if (timer != null) window.clearInterval(timer);
    observer.disconnect();
  }, { once: true });
}
