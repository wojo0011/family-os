export const GOOGLE_BASE_SCOPES = ['openid', 'email', 'profile'] as const;
export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
] as const;
export const GOOGLE_CONTACTS_SCOPE = 'https://www.googleapis.com/auth/contacts';
export const GOOGLE_DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const GOOGLE_DEFAULT_SCOPES = [...GOOGLE_BASE_SCOPES, ...GOOGLE_CALENDAR_SCOPES] as const;

export type GoogleAuthStatus = 'disconnected' | 'connecting' | 'connected' | 'expired' | 'error';
export type GoogleAccount = { name: string; email: string; picture: string };
export type GoogleAuthState = {
  status: GoogleAuthStatus;
  account: GoogleAccount | null;
  grantedScopes: string[];
  expiresAt: number | null;
  error: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };
type TokenClientConfig = {
  client_id: string;
  scope: string;
  callback: (response: GoogleTokenResponse) => void;
  include_granted_scopes?: boolean;
  error_callback?: (error: unknown) => void;
};

const ACCOUNT_HINT_KEY = 'family-os:google-account-hint-v1';
const GIS_SCRIPT_ID = 'family-os-google-identity-services';
const EXPIRY_SAFETY_MS = 30_000;

let accessToken: string | null = null;
let expiryTimer: number | null = null;
let gisPromise: Promise<void> | null = null;
let patched = false;
let originalInitTokenClient: ((config: TokenClientConfig) => TokenClient) | null = null;
const listeners = new Set<(state: GoogleAuthState) => void>();

function loadAccountHint(): GoogleAccount | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(ACCOUNT_HINT_KEY) || 'null') as Partial<GoogleAccount> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
      picture: typeof parsed.picture === 'string' ? parsed.picture : '',
    };
  } catch {
    return null;
  }
}

let state: GoogleAuthState = {
  status: 'disconnected',
  account: loadAccountHint(),
  grantedScopes: [],
  expiresAt: null,
  error: '',
};

function emit(next: Partial<GoogleAuthState>) {
  state = { ...state, ...next };
  listeners.forEach(listener => listener({ ...state, grantedScopes: [...state.grantedScopes] }));
  window.dispatchEvent(new CustomEvent('family-os:google-auth-changed', { detail: getGoogleAuthState() }));
}

function reportAuthFailure(message: string) {
  if (accessToken) {
    // A denied incremental scope should not throw away a still-valid Calendar/account session.
    emit({ status: 'connected', error: message });
  } else {
    emit({ status: 'error', error: message, expiresAt: null });
  }
}

function clearExpiryTimer() {
  if (expiryTimer != null) window.clearTimeout(expiryTimer);
  expiryTimer = null;
}

function scheduleExpiry(expiresAt: number) {
  clearExpiryTimer();
  const delay = Math.max(0, expiresAt - Date.now());
  expiryTimer = window.setTimeout(() => {
    accessToken = null;
    emit({ status: 'expired', expiresAt: null, error: '' });
  }, delay);
}

function normalizeScopes(scopeText: string | undefined, fallback: string) {
  const values = (scopeText || fallback).split(/\s+/).map(value => value.trim()).filter(Boolean);
  return Array.from(new Set(values)).sort();
}

async function loadProfile(token: string) {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Google profile request failed (${response.status}).`);
  const payload = await response.json() as { name?: string; email?: string; picture?: string };
  const account: GoogleAccount = {
    name: payload.name || payload.email || 'Google user',
    email: payload.email || '',
    picture: payload.picture || '',
  };
  try { sessionStorage.setItem(ACCOUNT_HINT_KEY, JSON.stringify(account)); } catch { /* storage may be unavailable */ }
  emit({ account });
}

function captureTokenResponse(response: GoogleTokenResponse, requestedScope: string) {
  if (response.error || !response.access_token) {
    const message = response.error_description || response.error || 'Google authorization failed.';
    reportAuthFailure(message);
    return;
  }

  accessToken = response.access_token;
  const expiresIn = Math.max(60, Number(response.expires_in || 3600));
  const expiresAt = Date.now() + expiresIn * 1000 - EXPIRY_SAFETY_MS;
  const grantedScopes = normalizeScopes(response.scope, requestedScope);
  emit({ status: 'connected', grantedScopes, expiresAt, error: '' });
  scheduleExpiry(expiresAt);
  void loadProfile(response.access_token).catch(error => {
    console.warn('Family OS could not load the Google profile.', error);
  });
}

export function getGoogleAuthState(): GoogleAuthState {
  return { ...state, grantedScopes: [...state.grantedScopes] };
}

export function subscribeGoogleAuth(listener: (state: GoogleAuthState) => void) {
  listeners.add(listener);
  listener(getGoogleAuthState());
  return () => listeners.delete(listener);
}

export function hasGoogleScope(scope: string) {
  return state.grantedScopes.includes(scope);
}

export async function loadGoogleIdentityServices() {
  if (typeof window === 'undefined') return;
  if ((window as any).google?.accounts?.oauth2) return;
  if (gisPromise) return gisPromise;

  gisPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GIS_SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement('script');
    if (!existing) {
      script.id = GIS_SCRIPT_ID;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const finish = () => (window as any).google?.accounts?.oauth2
      ? resolve()
      : reject(new Error('Google Identity Services loaded without OAuth support.'));

    if ((window as any).google?.accounts?.oauth2) return resolve();
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => reject(new Error('Google Identity Services failed to load.')), { once: true });
  });

  return gisPromise;
}

export async function installGoogleAuthCapture() {
  await loadGoogleIdentityServices();
  if (patched) return;
  const oauth2 = (window as any).google?.accounts?.oauth2;
  if (!oauth2?.initTokenClient) throw new Error('Google OAuth client is unavailable.');

  originalInitTokenClient = oauth2.initTokenClient.bind(oauth2) as (config: TokenClientConfig) => TokenClient;
  oauth2.initTokenClient = (config: TokenClientConfig) => {
    const requestedScope = config.scope;
    const originalCallback = config.callback;
    const originalErrorCallback = config.error_callback;
    const client = originalInitTokenClient!({
      ...config,
      include_granted_scopes: true,
      callback: (response: GoogleTokenResponse) => {
        captureTokenResponse(response, requestedScope);
        originalCallback?.(response);
      },
      error_callback: (error: unknown) => {
        reportAuthFailure('Google authorization popup failed.');
        originalErrorCallback?.(error);
      },
    });

    return {
      requestAccessToken: (options = {}) => {
        emit({ status: 'connecting', error: '' });
        client.requestAccessToken(options);
      },
    } satisfies TokenClient;
  };
  patched = true;
}

export async function requestAdditionalGoogleScopes(scopes: string[]) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
  if (!clientId) throw new Error('Google OAuth client ID is not configured.');
  await installGoogleAuthCapture();

  const requested = Array.from(new Set([
    ...GOOGLE_BASE_SCOPES,
    ...state.grantedScopes,
    ...scopes,
  ])).join(' ');

  return new Promise<GoogleAuthState>((resolve, reject) => {
    const oauth2 = (window as any).google?.accounts?.oauth2;
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: requested,
      include_granted_scopes: true,
      callback: (response: GoogleTokenResponse) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || 'Google authorization failed.'));
          return;
        }
        window.setTimeout(() => resolve(getGoogleAuthState()), 0);
      },
      error_callback: () => reject(new Error('Google authorization popup failed.')),
    });
    client.requestAccessToken({ prompt: 'consent' });
  });
}

export async function googleApiFetch(input: RequestInfo | URL, init: RequestInit = {}, requiredScopes: string[] = []) {
  if (!accessToken || state.status !== 'connected') throw new Error('Google authorization is not active. Reconnect Google first.');
  const missing = requiredScopes.filter(scope => !hasGoogleScope(scope));
  if (missing.length) throw new Error(`Google permission required: ${missing.join(', ')}`);

  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) {
    accessToken = null;
    clearExpiryTimer();
    emit({ status: 'expired', expiresAt: null, error: 'Google access expired. Reconnect to continue.' });
  }
  return response;
}

export async function disconnectGoogle() {
  const token = accessToken;
  accessToken = null;
  clearExpiryTimer();
  try { sessionStorage.removeItem(ACCOUNT_HINT_KEY); } catch { /* storage may be unavailable */ }

  const finish = () => {
    state = { status: 'disconnected', account: null, grantedScopes: [], expiresAt: null, error: '' };
    listeners.forEach(listener => listener(getGoogleAuthState()));
    window.location.reload();
  };

  if (!token) return finish();
  await loadGoogleIdentityServices().catch(() => undefined);
  const revoke = (window as any).google?.accounts?.oauth2?.revoke;
  if (typeof revoke !== 'function') return finish();
  revoke(token, finish);
}
