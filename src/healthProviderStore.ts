export const HEALTH_PROVIDER_TYPES = [
  'Family doctor',
  'Dentist',
  'Dental specialist',
  'Pharmacy',
  'Optometrist',
  'Specialist',
  'Therapist',
  'Clinic',
  'Other',
] as const;

export type HealthProviderType = typeof HEALTH_PROVIDER_TYPES[number];
export type ProviderPerson = 'Family' | 'Dad' | 'Mom' | 'Teen' | 'Child';

export type HealthProvider = {
  id: string;
  name: string;
  type: HealthProviderType;
  organization: string;
  person: ProviderPerson;
  phone: string;
  email: string;
  address: string;
  website: string;
  lastVisitDate: string;
  followUpMonths: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  sync: {
    provider: 'local' | 'google-contacts';
    status: 'local-only' | 'pending' | 'synced' | 'conflict';
    googleResourceName?: string;
    googleEtag?: string;
  };
};

export type HealthProviderInput = Omit<HealthProvider, 'id' | 'createdAt' | 'updatedAt' | 'sync'>;
export type ProviderValidation = { valid: boolean; values: HealthProviderInput; errors: Record<string, string> };

const STORAGE_KEY = 'family-os:health-providers-v1';
const CHANGE_EVENT = 'family-os:health-providers-changed';
const MAX_PROVIDERS = 100;
const PEOPLE: ProviderPerson[] = ['Family', 'Dad', 'Mom', 'Teen', 'Child'];

function clean(value: unknown, max = 4000) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function validDate(value: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return !Number.isNaN(parsed.getTime());
}

function validEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateHealthProvider(raw: Partial<HealthProviderInput>): ProviderValidation {
  const type = HEALTH_PROVIDER_TYPES.includes(raw.type as HealthProviderType) ? raw.type as HealthProviderType : 'Other';
  const person = PEOPLE.includes(raw.person as ProviderPerson) ? raw.person as ProviderPerson : 'Family';
  const rawMonths = raw.followUpMonths;
  const followUpMonths = rawMonths == null || rawMonths === 0 ? null : Number(rawMonths);

  const values: HealthProviderInput = {
    name: clean(raw.name, 160),
    type,
    organization: clean(raw.organization, 180),
    person,
    phone: clean(raw.phone, 80),
    email: clean(raw.email, 180),
    address: clean(raw.address, 320),
    website: clean(raw.website, 320),
    lastVisitDate: clean(raw.lastVisitDate, 10),
    followUpMonths: Number.isFinite(followUpMonths) && followUpMonths != null ? followUpMonths : null,
    notes: clean(raw.notes),
  };

  const errors: Record<string, string> = {};
  if (values.name.length < 2) errors.name = 'Provider name is required.';
  if (!validEmail(values.email)) errors.email = 'Enter a valid email address.';
  if (!validUrl(values.website)) errors.website = 'Enter a valid website address.';
  if (!validDate(values.lastVisitDate)) errors.lastVisitDate = 'Enter a valid last visit date.';
  if (values.followUpMonths != null && (values.followUpMonths < 1 || values.followUpMonths > 120)) {
    errors.followUpMonths = 'Follow-up interval must be between 1 and 120 months.';
  }
  if (values.phone.length > 80) errors.phone = 'Phone number is too long.';

  return { valid: Object.keys(errors).length === 0, values, errors };
}

function sanitize(value: unknown): HealthProvider | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<HealthProvider>;
  if (!item.id || !item.createdAt || !item.updatedAt) return null;
  const validation = validateHealthProvider(item);
  if (!validation.valid) return null;
  return {
    id: clean(item.id, 120),
    ...validation.values,
    createdAt: clean(item.createdAt, 40),
    updatedAt: clean(item.updatedAt, 40),
    sync: {
      provider: item.sync?.provider === 'google-contacts' ? 'google-contacts' : 'local',
      status: ['local-only', 'pending', 'synced', 'conflict'].includes(item.sync?.status ?? '')
        ? item.sync!.status
        : 'local-only',
      googleResourceName: item.sync?.googleResourceName ? clean(item.sync.googleResourceName, 220) : undefined,
      googleEtag: item.sync?.googleEtag ? clean(item.sync.googleEtag, 220) : undefined,
    },
  };
}

export function loadHealthProviders(): HealthProvider[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitize).filter((item): item is HealthProvider => Boolean(item));
  } catch {
    return [];
  }
}

function write(items: HealthProvider[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_PROVIDERS)));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function addHealthProvider(raw: Partial<HealthProviderInput>) {
  const validation = validateHealthProvider(raw);
  if (!validation.valid) return { provider: null, validation };
  const now = new Date().toISOString();
  const provider: HealthProvider = {
    id: `provider-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...validation.values,
    createdAt: now,
    updatedAt: now,
    sync: { provider: 'local', status: 'local-only' },
  };
  write([provider, ...loadHealthProviders()]);
  return { provider, validation };
}

export function updateHealthProvider(id: string, raw: Partial<HealthProviderInput>) {
  const items = loadHealthProviders();
  const index = items.findIndex(item => item.id === id);
  if (index < 0) return { provider: null, validation: null };
  const validation = validateHealthProvider(raw);
  if (!validation.valid) return { provider: null, validation };
  const provider: HealthProvider = {
    ...items[index],
    ...validation.values,
    updatedAt: new Date().toISOString(),
    sync: items[index].sync.provider === 'google-contacts'
      ? { ...items[index].sync, status: 'pending' }
      : items[index].sync,
  };
  items[index] = provider;
  write(items);
  return { provider, validation };
}

export function removeHealthProvider(id: string) {
  const items = loadHealthProviders();
  const next = items.filter(item => item.id !== id);
  if (next.length === items.length) return false;
  write(next);
  return true;
}

export function subscribeHealthProviders(listener: (items: HealthProvider[]) => void) {
  if (typeof window === 'undefined') return () => undefined;
  const notify = () => listener(loadHealthProviders());
  window.addEventListener(CHANGE_EVENT, notify);
  window.addEventListener('storage', notify);
  return () => {
    window.removeEventListener(CHANGE_EVENT, notify);
    window.removeEventListener('storage', notify);
  };
}

export function suggestedFollowUpMonths(type: HealthProviderType) {
  // These are UI defaults for reminder setup only, not medical recommendations.
  if (type === 'Dentist' || type === 'Dental specialist') return 6;
  return null;
}
