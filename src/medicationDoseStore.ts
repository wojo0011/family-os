export type MedicationDoseStatus = 'taken' | 'skipped';

export type MedicationDoseSchedule = {
  medicationId: string;
  doseTimes: string[];
  remindersEnabled: boolean;
  updatedAt: string;
};

export type MedicationDoseLog = {
  id: string;
  medicationId: string;
  date: string;
  time: string;
  status: MedicationDoseStatus;
  recordedAt: string;
};

export type MedicationAdherenceState = {
  schedules: MedicationDoseSchedule[];
  logs: MedicationDoseLog[];
};

const STORAGE_KEY = 'family-os:medication-adherence-v1';
const CHANGE_EVENT = 'family-os:medication-adherence-changed';
const MAX_LOGS = 2500;
const MAX_TIMES = 8;

const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());

export function normalizeDoseTimes(times: readonly string[]) {
  return Array.from(new Set(times.map(time => String(time ?? '').trim()).filter(validTime))).sort().slice(0, MAX_TIMES);
}

function sanitizeSchedule(value: unknown): MedicationDoseSchedule | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<MedicationDoseSchedule>;
  if (!item.medicationId || typeof item.medicationId !== 'string') return null;
  const doseTimes = normalizeDoseTimes(Array.isArray(item.doseTimes) ? item.doseTimes : []);
  return {
    medicationId: item.medicationId.slice(0, 160),
    doseTimes,
    remindersEnabled: item.remindersEnabled !== false,
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
  };
}

function sanitizeLog(value: unknown): MedicationDoseLog | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<MedicationDoseLog>;
  if (!item.id || !item.medicationId || !item.date || !item.time) return null;
  if (!validDate(item.date) || !validTime(item.time)) return null;
  if (item.status !== 'taken' && item.status !== 'skipped') return null;
  return {
    id: String(item.id).slice(0, 180),
    medicationId: String(item.medicationId).slice(0, 160),
    date: item.date,
    time: item.time,
    status: item.status,
    recordedAt: typeof item.recordedAt === 'string' ? item.recordedAt : new Date().toISOString(),
  };
}

export function loadMedicationAdherence(): MedicationAdherenceState {
  if (typeof localStorage === 'undefined') return { schedules: [], logs: [] };
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<MedicationAdherenceState>;
    return {
      schedules: Array.isArray(parsed.schedules) ? parsed.schedules.map(sanitizeSchedule).filter((item): item is MedicationDoseSchedule => Boolean(item)) : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs.map(sanitizeLog).filter((item): item is MedicationDoseLog => Boolean(item)).slice(0, MAX_LOGS) : [],
    };
  } catch {
    return { schedules: [], logs: [] };
  }
}

function write(state: MedicationAdherenceState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    schedules: state.schedules,
    logs: state.logs.slice(0, MAX_LOGS),
  }));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function scheduleForMedication(
  medicationId: string,
  fallbackTimes: readonly string[] = [],
  fallbackReminders = true,
  state = loadMedicationAdherence(),
): MedicationDoseSchedule {
  return state.schedules.find(item => item.medicationId === medicationId) ?? {
    medicationId,
    doseTimes: normalizeDoseTimes(fallbackTimes),
    remindersEnabled: fallbackReminders,
    updatedAt: '',
  };
}

export function saveMedicationSchedule(medicationId: string, doseTimes: readonly string[], remindersEnabled: boolean) {
  const state = loadMedicationAdherence();
  const schedule: MedicationDoseSchedule = {
    medicationId,
    doseTimes: normalizeDoseTimes(doseTimes),
    remindersEnabled,
    updatedAt: new Date().toISOString(),
  };
  const schedules = [schedule, ...state.schedules.filter(item => item.medicationId !== medicationId)];
  write({ ...state, schedules });
  return schedule;
}

export function recordMedicationDose(medicationId: string, date: string, time: string, status: MedicationDoseStatus) {
  if (!medicationId || !validDate(date) || !validTime(time)) return null;
  const state = loadMedicationAdherence();
  const id = `dose:${medicationId}:${date}:${time}`;
  const log: MedicationDoseLog = {
    id,
    medicationId,
    date,
    time,
    status,
    recordedAt: new Date().toISOString(),
  };
  const logs = [log, ...state.logs.filter(item => item.id !== id)].slice(0, MAX_LOGS);
  write({ ...state, logs });
  return log;
}

export function clearMedicationDose(medicationId: string, date: string, time: string) {
  const state = loadMedicationAdherence();
  const id = `dose:${medicationId}:${date}:${time}`;
  const logs = state.logs.filter(item => item.id !== id);
  if (logs.length === state.logs.length) return false;
  write({ ...state, logs });
  return true;
}

export function doseLogFor(medicationId: string, date: string, time: string, state = loadMedicationAdherence()) {
  return state.logs.find(item => item.medicationId === medicationId && item.date === date && item.time === time) ?? null;
}

export function removeMedicationAdherence(medicationId: string) {
  const state = loadMedicationAdherence();
  const schedules = state.schedules.filter(item => item.medicationId !== medicationId);
  const logs = state.logs.filter(item => item.medicationId !== medicationId);
  if (schedules.length === state.schedules.length && logs.length === state.logs.length) return false;
  write({ schedules, logs });
  return true;
}

export function subscribeMedicationAdherence(listener: (state: MedicationAdherenceState) => void) {
  if (typeof window === 'undefined') return () => undefined;
  const notify = () => listener(loadMedicationAdherence());
  window.addEventListener(CHANGE_EVENT, notify);
  window.addEventListener('storage', notify);
  return () => {
    window.removeEventListener(CHANGE_EVENT, notify);
    window.removeEventListener('storage', notify);
  };
}
