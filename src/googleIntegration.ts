export type GooglePersonId = 'dad' | 'mom' | 'teen' | 'child' | 'family';

export type GoogleFamilyEvent = {
  id: string;
  title: string;
  start: Date;
  end?: Date;
  person: GooglePersonId;
  category: string;
  location?: string;
  outdoor?: boolean;
  source: 'google';
};

export type GooglePreferences = {
  theme?: 'midnight' | 'space' | 'nature' | 'soft';
  lens?: GooglePersonId;
  specialDaySet?: 'all' | 'canada' | 'celebrations' | 'seasonal' | 'off';
  specialDayEffect?: 'rich' | 'subtle';
};

export type GoogleConnectionResult = {
  name: string;
  events: GoogleFamilyEvent[];
  calendarCount: number;
  availableCalendarCount: number;
  preferences: GooglePreferences | null;
  driveReady: boolean;
  driveWarning?: string;
};

type GoogleCalendar = {
  id: string;
  summary?: string;
  summaryOverride?: string;
  primary?: boolean;
  selected?: boolean;
  deleted?: boolean;
  accessRole?: string;
};

type GoogleCalendarEvent = {
  id?: string;
  summary?: string;
  status?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  extendedProperties?: {
    private?: Record<string, string>;
  };
};

const GIS_SCRIPT_ID = 'family-os-google-identity-services';
const PREFERENCES_FILE_NAME = 'family-os-preferences.json';
const MAX_CALENDARS = 20;

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
].join(' ');

let accessToken: string | null = null;
let preferencesFileId: string | null = null;

export function isGoogleConfigured() {
  return Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim());
}

export function personForCalendarSummary(summary = ''): GooglePersonId {
  const lower = summary.toLowerCase();
  if (/\bmom\b|\bmum\b|\bmother\b/.test(lower)) return 'mom';
  if (/\bteen\b|\bteenager\b/.test(lower)) return 'teen';
  if (/\bchild\b|\bkid\b|\bkids\b|\bchildcare\b/.test(lower)) return 'child';
  if (/\bdad\b|\bfather\b/.test(lower)) return 'dad';
  return 'family';
}

export function sanitizeGooglePreferences(value: unknown): GooglePreferences | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const output: GooglePreferences = {};

  if (['midnight', 'space', 'nature', 'soft'].includes(String(input.theme))) {
    output.theme = input.theme as GooglePreferences['theme'];
  }
  if (['dad', 'mom', 'teen', 'child', 'family'].includes(String(input.lens))) {
    output.lens = input.lens as GooglePreferences['lens'];
  }
  if (['all', 'canada', 'celebrations', 'seasonal', 'off'].includes(String(input.specialDaySet))) {
    output.specialDaySet = input.specialDaySet as GooglePreferences['specialDaySet'];
  }
  if (['rich', 'subtle'].includes(String(input.specialDayEffect))) {
    output.specialDayEffect = input.specialDayEffect as GooglePreferences['specialDayEffect'];
  }

  return Object.keys(output).length ? output : null;
}

function googleErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}

async function loadGoogleIdentityServices() {
  if ((window as any).google?.accounts?.oauth2) return;

  await new Promise<void>((resolve, reject) => {
    const ready = () => {
      if ((window as any).google?.accounts?.oauth2) resolve();
      else reject(new Error('Google Identity Services loaded without the OAuth client.'));
    };

    const existing = document.getElementById(GIS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', ready, { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Identity Services failed to load.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = GIS_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.addEventListener('load', ready, { once: true });
    script.addEventListener('error', () => reject(new Error('Google Identity Services failed to load.')), { once: true });
    document.head.appendChild(script);
  });
}

async function requestAccessToken() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error('Google setup is incomplete: add VITE_GOOGLE_CLIENT_ID to the GitHub repository variables.');
  }

  await loadGoogleIdentityServices();

  const token = await new Promise<string>((resolve, reject) => {
    const google = (window as any).google;
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPES,
      include_granted_scopes: true,
      callback: (result: any) => {
        if (result?.error) {
          reject(new Error(result.error_description || result.error));
          return;
        }
        if (!result?.access_token) {
          reject(new Error('Google did not return an access token.'));
          return;
        }
        resolve(result.access_token);
      },
      error_callback: (result: any) => {
        reject(new Error(result?.message || result?.type || 'Google sign-in was cancelled or blocked.'));
      },
    });

    client.requestAccessToken({ prompt: 'consent' });
  });

  accessToken = token;
  preferencesFileId = null;
  return token;
}

async function googleFetch(input: string | URL, init: RequestInit = {}) {
  if (!accessToken) throw new Error('Google is not connected.');

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(input, { ...init, headers });

  if (!response.ok) {
    let detail = '';
    try {
      const payload = await response.json();
      detail = payload?.error?.message || payload?.error_description || payload?.message || '';
    } catch {
      detail = await response.text().catch(() => '');
    }

    if (response.status === 401) {
      accessToken = null;
      preferencesFileId = null;
      throw new Error('Google session expired. Connect Google again.');
    }

    throw new Error(detail || `Google request failed (${response.status}).`);
  }

  return response;
}

async function googleJson<T>(input: string | URL, init: RequestInit = {}): Promise<T> {
  const response = await googleFetch(input, init);
  return response.json() as Promise<T>;
}

async function loadProfile() {
  return googleJson<{ name?: string; email?: string }>('https://www.googleapis.com/oauth2/v3/userinfo');
}

async function listCalendars() {
  const calendars: GoogleCalendar[] = [];
  let pageToken = '';

  do {
    const url = new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList');
    url.searchParams.set('maxResults', '250');
    url.searchParams.set('showDeleted', 'false');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const payload = await googleJson<{ items?: GoogleCalendar[]; nextPageToken?: string }>(url);
    calendars.push(...(payload.items ?? []));
    pageToken = payload.nextPageToken ?? '';
  } while (pageToken);

  return calendars.filter(calendar => !calendar.deleted && calendar.id);
}

function calendarShouldLoad(calendar: GoogleCalendar) {
  if (calendar.accessRole === 'none' || calendar.accessRole === 'freeBusyReader') return false;
  if (calendar.primary || calendar.selected) return true;
  return /\bfamily\b|\bmom\b|\bmum\b|\bmother\b|\bdad\b|\bfather\b|\bteen\b|\bchild\b|\bkid\b/i.test(calendar.summaryOverride || calendar.summary || '');
}

function parseGoogleDate(value?: { date?: string; dateTime?: string }) {
  const raw = value?.dateTime || (value?.date ? `${value.date}T00:00:00` : '');
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function loadEventsForCalendar(calendar: GoogleCalendar) {
  const min = new Date();
  min.setDate(min.getDate() - 31);
  const max = new Date();
  max.setMonth(max.getMonth() + 6);

  const query = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: min.toISOString(),
    timeMax: max.toISOString(),
    maxResults: '500',
    showDeleted: 'false',
  });

  const payload = await googleJson<{ items?: GoogleCalendarEvent[] }>(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?${query}`,
  );

  const summary = calendar.summaryOverride || calendar.summary || '';
  const person = personForCalendarSummary(summary);

  return (payload.items ?? []).flatMap((event): GoogleFamilyEvent[] => {
    if (event.status === 'cancelled') return [];
    const start = parseGoogleDate(event.start);
    if (!start) return [];
    const end = parseGoogleDate(event.end) ?? undefined;

    return [{
      id: `${calendar.id}:${event.id || `${start.toISOString()}:${event.summary || 'event'}`}`,
      title: event.summary || 'Busy',
      start,
      end,
      person,
      category: event.extendedProperties?.private?.familyOsCategory || 'calendar',
      location: event.location,
      outdoor: event.extendedProperties?.private?.familyOsOutdoor === 'true',
      source: 'google',
    }];
  });
}

async function loadPreferences(): Promise<GooglePreferences | null> {
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('spaces', 'appDataFolder');
  url.searchParams.set('q', `name = '${PREFERENCES_FILE_NAME}' and trashed = false`);
  url.searchParams.set('fields', 'files(id,name,modifiedTime)');
  url.searchParams.set('pageSize', '10');

  const payload = await googleJson<{ files?: Array<{ id: string; modifiedTime?: string }> }>(url);
  const files = [...(payload.files ?? [])].sort((a, b) => String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')));
  const file = files[0];
  if (!file?.id) return null;

  preferencesFileId = file.id;
  const response = await googleFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`);
  return sanitizeGooglePreferences(await response.json());
}

async function createPreferencesFile(preferences: GooglePreferences) {
  const boundary = `family-os-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const metadata = JSON.stringify({
    name: PREFERENCES_FILE_NAME,
    parents: ['appDataFolder'],
    mimeType: 'application/json',
  });
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(preferences),
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const payload = await googleJson<{ id?: string }>('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });

  if (!payload.id) throw new Error('Google Drive did not return a preference file ID.');
  preferencesFileId = payload.id;
}

export async function saveGooglePreferences(preferences: GooglePreferences) {
  if (!accessToken) return false;

  const cleaned = sanitizeGooglePreferences(preferences) ?? {};
  if (!preferencesFileId) {
    await createPreferencesFile(cleaned);
    return true;
  }

  await googleFetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(preferencesFileId)}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(cleaned),
  });
  return true;
}

export async function connectGoogle(): Promise<GoogleConnectionResult> {
  await requestAccessToken();

  const [profile, calendars, preferencesResult] = await Promise.all([
    loadProfile(),
    listCalendars(),
    loadPreferences()
      .then(preferences => ({ preferences, driveReady: true as const, warning: undefined }))
      .catch(error => ({
        preferences: null,
        driveReady: false as const,
        warning: googleErrorMessage(error, 'Google Drive preference sync is unavailable.'),
      })),
  ]);

  const calendarsToLoad = calendars.filter(calendarShouldLoad).slice(0, MAX_CALENDARS);
  const eventGroups = await Promise.all(calendarsToLoad.map(loadEventsForCalendar));

  return {
    name: profile.name || profile.email || 'Google user',
    events: eventGroups.flat().sort((a, b) => a.start.getTime() - b.start.getTime()),
    calendarCount: calendarsToLoad.length,
    availableCalendarCount: calendars.length,
    preferences: preferencesResult.preferences,
    driveReady: preferencesResult.driveReady,
    driveWarning: preferencesResult.warning,
  };
}

export async function disconnectGoogle() {
  const token = accessToken;
  accessToken = null;
  preferencesFileId = null;
  if (!token) return;

  try {
    await loadGoogleIdentityServices();
    await new Promise<void>(resolve => {
      (window as any).google.accounts.oauth2.revoke(token, () => resolve());
    });
  } catch {
    // The local session is already disconnected even if Google cannot be reached.
  }
}
