export const CAPTURE_KINDS = [
  'Event',
  'Reminder',
  'Expense',
  'Scan receipt',
  'Medication',
  'Health entry',
  'Milestone',
  'Pet record',
  'Vehicle update',
  'Home maintenance',
  'Speak',
] as const;

export type CaptureKind = typeof CAPTURE_KINDS[number];

export type CaptureRecord = {
  id: string;
  kind: CaptureKind;
  createdAt: string;
  updatedAt?: string;
  values: Record<string, string>;
};

export type CaptureValidationResult = {
  valid: boolean;
  values: Record<string, string>;
  errors: Record<string, string>;
};

export type LocalCalendarEntry = {
  id: string;
  recordId: string;
  title: string;
  start: Date;
  person: 'dad' | 'mom' | 'teen' | 'child' | 'family';
  category: string;
  location?: string;
  outdoor?: boolean;
};

const STORAGE_KEY = 'family-os:capture-records-v1';
const CHANGE_EVENT = 'family-os:capture-changed';
const MAX_RECORDS = 500;

const isCaptureKind = (value: unknown): value is CaptureKind =>
  typeof value === 'string' && (CAPTURE_KINDS as readonly string[]).includes(value);

const cleanText = (value: unknown) => String(value ?? '').replace(/\u0000/g, '').trim();

export function normalizeCaptureValues(values: Record<string, string>) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, cleanText(value)]));
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return !Number.isNaN(parsed.getTime());
}

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function required(errors: Record<string, string>, values: Record<string, string>, field: string, label: string, min = 1) {
  const value = values[field] ?? '';
  if (value.length < min) errors[field] = `${label} is required${min > 1 ? ` and must be at least ${min} characters` : ''}.`;
}

function maxLength(errors: Record<string, string>, values: Record<string, string>, field: string, label: string, max: number) {
  if ((values[field] ?? '').length > max) errors[field] = `${label} must be ${max} characters or fewer.`;
}

function dateField(errors: Record<string, string>, values: Record<string, string>, field: string, label: string, optional = false) {
  const value = values[field] ?? '';
  if (!value && optional) return;
  if (!isValidDate(value)) errors[field] = `Enter a valid ${label.toLowerCase()}.`;
}

function timeField(errors: Record<string, string>, values: Record<string, string>, field: string, label: string, optional = false) {
  const value = values[field] ?? '';
  if (!value && optional) return;
  if (!isValidTime(value)) errors[field] = `Enter a valid ${label.toLowerCase()}.`;
}

function nonNegativeNumber(
  errors: Record<string, string>,
  values: Record<string, string>,
  field: string,
  label: string,
  options: { required?: boolean; positive?: boolean; max?: number } = {},
) {
  const raw = values[field] ?? '';
  if (!raw) {
    if (options.required) errors[field] = `${label} is required.`;
    return;
  }
  const number = Number(raw);
  if (!Number.isFinite(number)) {
    errors[field] = `${label} must be a number.`;
    return;
  }
  if (options.positive ? number <= 0 : number < 0) {
    errors[field] = options.positive ? `${label} must be greater than 0.` : `${label} cannot be negative.`;
    return;
  }
  if (options.max != null && number > options.max) errors[field] = `${label} is above the supported maximum.`;
}

function allowed(errors: Record<string, string>, values: Record<string, string>, field: string, label: string, choices: readonly string[]) {
  const value = values[field] ?? '';
  if (!choices.includes(value)) errors[field] = `Choose a valid ${label.toLowerCase()}.`;
}

export function validateCaptureValues(kind: CaptureKind, rawValues: Record<string, string>): CaptureValidationResult {
  const values = normalizeCaptureValues(rawValues);
  const errors: Record<string, string> = {};

  switch (kind) {
    case 'Event':
      required(errors, values, 'title', 'Event title', 2);
      dateField(errors, values, 'date', 'Date');
      timeField(errors, values, 'time', 'Time');
      allowed(errors, values, 'person', 'Who', ['Family', 'Dad', 'Mom', 'Teen', 'Child']);
      allowed(errors, values, 'category', 'Type', ['Family', 'School', 'Sport', 'Appointment', 'Work', 'Other']);
      maxLength(errors, values, 'location', 'Location', 180);
      break;
    case 'Reminder':
      required(errors, values, 'title', 'Reminder', 2);
      dateField(errors, values, 'date', 'Due date');
      timeField(errors, values, 'time', 'Due time', true);
      allowed(errors, values, 'person', 'Who', ['Family', 'Dad', 'Mom', 'Teen', 'Child']);
      allowed(errors, values, 'priority', 'Priority', ['Normal', 'Important', 'Urgent']);
      break;
    case 'Expense':
      required(errors, values, 'merchant', 'Merchant / description', 2);
      nonNegativeNumber(errors, values, 'amount', 'Amount', { required: true, positive: true, max: 10_000_000 });
      dateField(errors, values, 'date', 'Date');
      allowed(errors, values, 'person', 'Paid by', ['Family', 'Dad', 'Mom', 'Teen']);
      break;
    case 'Scan receipt':
      required(errors, values, 'merchant', 'Merchant', 2);
      nonNegativeNumber(errors, values, 'amount', 'Total', { positive: true, max: 10_000_000 });
      dateField(errors, values, 'date', 'Date', true);
      maxLength(errors, values, 'receipt', 'Receipt file name', 260);
      break;
    case 'Medication':
      required(errors, values, 'medication', 'Medication', 2);
      required(errors, values, 'directions', 'Directions', 2);
      dateField(errors, values, 'startDate', 'Start date');
      dateField(errors, values, 'endDate', 'End date', true);
      timeField(errors, values, 'time', 'Schedule time', true);
      allowed(errors, values, 'person', 'For', ['Dad', 'Mom', 'Teen', 'Child', 'Family']);
      if (!errors.startDate && !errors.endDate && values.startDate && values.endDate && values.endDate < values.startDate) {
        errors.endDate = 'End date cannot be before the start date.';
      }
      break;
    case 'Health entry':
      required(errors, values, 'value', 'Reading / value');
      dateField(errors, values, 'date', 'Date');
      timeField(errors, values, 'time', 'Time');
      allowed(errors, values, 'person', 'For', ['Dad', 'Mom', 'Teen', 'Child']);
      allowed(errors, values, 'entryType', 'Entry type', ['Temperature', 'Symptom', 'Blood pressure', 'Heart rate', 'Weight', 'Doctor note', 'Other']);
      break;
    case 'Milestone':
      required(errors, values, 'title', 'Milestone', 2);
      dateField(errors, values, 'date', 'Date');
      allowed(errors, values, 'person', 'Who', ['Family', 'Dad', 'Mom', 'Teen', 'Child']);
      break;
    case 'Pet record':
      required(errors, values, 'pet', 'Pet name', 1);
      dateField(errors, values, 'date', 'Date');
      required(errors, values, 'recordType', 'Record type');
      break;
    case 'Vehicle update':
      required(errors, values, 'vehicle', 'Vehicle', 2);
      dateField(errors, values, 'date', 'Date');
      required(errors, values, 'updateType', 'Update type');
      nonNegativeNumber(errors, values, 'odometer', 'Odometer');
      nonNegativeNumber(errors, values, 'cost', 'Cost', { max: 10_000_000 });
      break;
    case 'Home maintenance':
      required(errors, values, 'task', 'Task', 2);
      dateField(errors, values, 'date', 'Due / completed date');
      required(errors, values, 'area', 'Area');
      required(errors, values, 'repeat', 'Repeat');
      break;
    case 'Speak':
      required(errors, values, 'transcript', 'Quick capture', 2);
      allowed(errors, values, 'saveAs', 'Save as', ['Quick note', 'Reminder', 'Event idea', 'Health note', 'Home note', 'Vehicle note']);
      break;
  }

  const commonTextFields = ['title', 'merchant', 'medication', 'directions', 'value', 'pet', 'vehicle', 'task', 'provider'];
  commonTextFields.forEach(field => maxLength(errors, values, field, field, 220));
  maxLength(errors, values, 'notes', 'Notes', 4000);
  maxLength(errors, values, 'transcript', 'Quick capture', 4000);

  return { valid: Object.keys(errors).length === 0, values, errors };
}

function sanitizeRecord(value: unknown): CaptureRecord | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<CaptureRecord>;
  if (!candidate.id || typeof candidate.id !== 'string' || !isCaptureKind(candidate.kind) || typeof candidate.createdAt !== 'string') return null;
  if (!candidate.values || typeof candidate.values !== 'object') return null;
  const values = Object.fromEntries(Object.entries(candidate.values).map(([key, fieldValue]) => [key, cleanText(fieldValue)]));
  return {
    id: candidate.id,
    kind: candidate.kind,
    createdAt: candidate.createdAt,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : undefined,
    values,
  };
}

export function loadCaptureRecords(): CaptureRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeRecord).filter((record): record is CaptureRecord => Boolean(record));
  } catch {
    return [];
  }
}

function emitChange(type: 'saved' | 'updated' | 'deleted', record?: CaptureRecord, id?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { type, record, id } }));
  if (type === 'saved' && record) window.dispatchEvent(new CustomEvent('family-os:capture-saved', { detail: record }));
  if (type === 'deleted') window.dispatchEvent(new CustomEvent('family-os:capture-deleted', { detail: { id } }));
}

function writeCaptureRecords(records: CaptureRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)));
}

export function addCaptureRecord(kind: CaptureKind, rawValues: Record<string, string>) {
  const validation = validateCaptureValues(kind, rawValues);
  if (!validation.valid) return { record: null, validation };

  const now = new Date().toISOString();
  const record: CaptureRecord = {
    id: `capture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    createdAt: now,
    updatedAt: now,
    values: validation.values,
  };
  const records = loadCaptureRecords();
  records.unshift(record);
  writeCaptureRecords(records);
  emitChange('saved', record);
  return { record, validation };
}

export function updateCaptureRecord(id: string, rawValues: Record<string, string>) {
  const records = loadCaptureRecords();
  const index = records.findIndex(record => record.id === id);
  if (index < 0) return { record: null, validation: null };
  const existing = records[index];
  const validation = validateCaptureValues(existing.kind, rawValues);
  if (!validation.valid) return { record: null, validation };
  const record: CaptureRecord = { ...existing, updatedAt: new Date().toISOString(), values: validation.values };
  records[index] = record;
  writeCaptureRecords(records);
  emitChange('updated', record);
  return { record, validation };
}

export function removeCaptureRecord(id: string) {
  const records = loadCaptureRecords();
  const next = records.filter(record => record.id !== id);
  if (next.length === records.length) return false;
  writeCaptureRecords(next);
  emitChange('deleted', undefined, id);
  return true;
}

export function subscribeCaptureRecords(listener: (records: CaptureRecord[]) => void) {
  if (typeof window === 'undefined') return () => undefined;
  const notify = () => listener(loadCaptureRecords());
  window.addEventListener(CHANGE_EVENT, notify as EventListener);
  window.addEventListener('storage', notify);
  return () => {
    window.removeEventListener(CHANGE_EVENT, notify as EventListener);
    window.removeEventListener('storage', notify);
  };
}

function personId(value: string | undefined): LocalCalendarEntry['person'] {
  const normalized = (value ?? 'Family').toLowerCase();
  if (normalized === 'dad' || normalized === 'mom' || normalized === 'teen' || normalized === 'child') return normalized;
  return 'family';
}

function dateTime(date: string | undefined, time?: string) {
  if (!date || !isValidDate(date)) return null;
  const clock = time && isValidTime(time) ? time : '12:00';
  const parsed = new Date(`${date}T${clock}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function captureRecordToCalendarEntry(record: CaptureRecord): LocalCalendarEntry | null {
  const v = record.values;
  let title = '';
  let start: Date | null = null;
  let category = record.kind.toLowerCase().replace(/\s+/g, '-');
  let location: string | undefined;

  switch (record.kind) {
    case 'Event':
      title = v.title;
      start = dateTime(v.date, v.time);
      category = (v.category || 'family').toLowerCase();
      location = v.location || undefined;
      break;
    case 'Reminder':
      title = `Reminder · ${v.title}`;
      start = dateTime(v.date, v.time);
      category = 'reminder';
      break;
    case 'Medication':
      title = `${v.medication}${v.directions ? ` · ${v.directions}` : ''}`;
      start = dateTime(v.startDate, v.time);
      category = 'health';
      break;
    case 'Health entry':
      title = `${v.entryType || 'Health'} · ${v.value}`;
      start = dateTime(v.date, v.time);
      category = 'health';
      break;
    case 'Milestone':
      title = v.title;
      start = dateTime(v.date, '12:00');
      category = 'milestone';
      break;
    case 'Pet record':
      title = `${v.pet} · ${v.recordType}`;
      start = dateTime(v.date, '12:00');
      category = 'pet';
      location = v.provider || undefined;
      break;
    case 'Vehicle update':
      title = `${v.vehicle} · ${v.updateType}`;
      start = dateTime(v.date, '12:00');
      category = 'vehicle';
      break;
    case 'Home maintenance':
      title = v.task;
      start = dateTime(v.date, '12:00');
      category = 'home';
      break;
    case 'Expense':
    case 'Scan receipt':
    case 'Speak':
      return null;
  }

  if (!title || !start) return null;
  return {
    id: `local:${record.id}`,
    recordId: record.id,
    title,
    start,
    person: personId(v.person),
    category,
    location,
  };
}

export function captureRecordSummary(record: CaptureRecord) {
  const v = record.values;
  switch (record.kind) {
    case 'Event': return v.title || 'Event';
    case 'Reminder': return v.title || 'Reminder';
    case 'Expense': return `${v.merchant || 'Expense'}${v.amount ? ` · $${Number(v.amount).toFixed(2)}` : ''}`;
    case 'Scan receipt': return `${v.merchant || 'Receipt'}${v.amount ? ` · $${Number(v.amount).toFixed(2)}` : ''}`;
    case 'Medication': return v.medication || 'Medication';
    case 'Health entry': return `${v.entryType || 'Health'}${v.value ? ` · ${v.value}` : ''}`;
    case 'Milestone': return v.title || 'Milestone';
    case 'Pet record': return `${v.pet || 'Pet'} · ${v.recordType || 'Record'}`;
    case 'Vehicle update': return `${v.vehicle || 'Vehicle'} · ${v.updateType || 'Update'}`;
    case 'Home maintenance': return v.task || 'Home maintenance';
    case 'Speak': return v.transcript || 'Quick capture';
  }
}

export function captureRecordDateLabel(record: CaptureRecord) {
  const raw = record.values.date || record.values.startDate || record.createdAt.slice(0, 10);
  const parsed = isValidDate(raw) ? new Date(`${raw}T12:00:00`) : new Date(record.createdAt);
  return Number.isNaN(parsed.getTime()) ? '' : new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}
