import { loadCaptureRecords, subscribeCaptureRecords, type CaptureRecord } from './localCaptureStore';
import { loadHealthProviders, subscribeHealthProviders, type HealthProvider } from './healthProviderStore';
import {
  doseLogFor,
  loadMedicationAdherence,
  normalizeDoseTimes,
  scheduleForMedication,
  subscribeMedicationAdherence,
  type MedicationAdherenceState,
} from './medicationDoseStore';

const SEEN_KEY = 'family-os:notification-seen-v1';
const CHECK_MS = 60_000;
const MAX_SEEN = 300;

let installed = false;
let timer: number | null = null;
let unsubscribeCapture: (() => void) | null = null;
let unsubscribeProviders: (() => void) | null = null;
let unsubscribeAdherence: (() => void) | null = null;
let captureRecords: CaptureRecord[] = [];
let providers: HealthProvider[] = [];
let adherence: MedicationAdherenceState = { schedules: [], logs: [] };

type PendingNotification = {
  key: string;
  title: string;
  body: string;
  tag: string;
};

function parseDateTime(date: string | undefined, time: string | undefined) {
  if (!date) return null;
  const parsed = new Date(`${date}T${time || '12:00'}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthsAfter(dateText: string, months: number) {
  const date = new Date(`${dateText}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function loadSeen() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string').slice(0, MAX_SEEN) : [];
  } catch {
    return [];
  }
}

function remember(key: string) {
  const next = [key, ...loadSeen().filter(item => item !== key)].slice(0, MAX_SEEN);
  localStorage.setItem(SEEN_KEY, JSON.stringify(next));
}

function bucketFor(msUntil: number) {
  if (msUntil <= 2 * 60 * 60 * 1000) return '2h';
  if (msUntil <= 24 * 60 * 60 * 1000) return '24h';
  return null;
}

function recordNotifications(record: CaptureRecord): PendingNotification[] {
  if (record.kind !== 'Event' && record.kind !== 'Reminder') return [];
  const date = record.values.date || record.values.startDate;
  const when = parseDateTime(date, record.values.time);
  if (!when) return [];
  const msUntil = when.getTime() - Date.now();
  if (msUntil < -60_000 || msUntil > 24 * 60 * 60 * 1000) return [];

  const bucket = bucketFor(msUntil);
  if (!bucket) return [];

  if (record.kind === 'Reminder') {
    const title = record.values.title || 'Reminder';
    return [{
      key: `reminder:${record.id}:${bucket}`,
      title: bucket === '2h' ? `Reminder soon · ${title}` : `Reminder tomorrow · ${title}`,
      body: `${date}${record.values.time ? ` at ${record.values.time}` : ''}${record.values.person ? ` · ${record.values.person}` : ''}`,
      tag: `family-os-reminder-${record.id}`,
    }];
  }

  const category = (record.values.category || '').toLowerCase();
  if (!['appointment', 'medical', 'dental'].includes(category)) return [];
  const title = record.values.title || 'Appointment';
  return [{
    key: `appointment:${record.id}:${bucket}`,
    title: bucket === '2h' ? `Appointment coming up · ${title}` : `Appointment tomorrow · ${title}`,
    body: `${date}${record.values.time ? ` at ${record.values.time}` : ''}${record.values.location ? ` · ${record.values.location}` : ''}`,
    tag: `family-os-appointment-${record.id}`,
  }];
}

function medicationNotifications(record: CaptureRecord): PendingNotification[] {
  if (record.kind !== 'Medication') return [];
  if (record.values.status === 'Paused' || record.values.status === 'Completed') return [];
  if (record.values.scheduleType === 'As needed') return [];

  const today = isoDate(new Date());
  if (record.values.startDate && today < record.values.startDate) return [];
  if (record.values.endDate && today > record.values.endDate) return [];

  const configured = (record.values.doseTimes || '').split(',').map(value => value.trim()).filter(Boolean);
  const fallbackTimes = normalizeDoseTimes(configured.length ? configured : record.values.time ? [record.values.time] : []);
  const schedule = scheduleForMedication(record.id, fallbackTimes, record.values.remindersEnabled !== 'false', adherence);
  if (!schedule.remindersEnabled || !schedule.doseTimes.length) return [];

  return schedule.doseTimes.flatMap(time => {
    if (doseLogFor(record.id, today, time, adherence)) return [];
    const when = parseDateTime(today, time);
    if (!when) return [];
    const msUntil = when.getTime() - Date.now();
    if (msUntil > 30 * 60 * 1000 || msUntil < -60 * 60 * 1000) return [];

    const bucket = msUntil > 0 ? 'soon' : 'due';
    const medication = record.values.medication || 'Medication';
    return [{
      key: `medication:${record.id}:${today}:${time}:${bucket}`,
      title: bucket === 'soon' ? `Medication coming up · ${medication}` : `Medication dose due · ${medication}`,
      body: `${time}${record.values.person ? ` · ${record.values.person}` : ''}${record.values.directions ? ` · ${record.values.directions}` : ''}`,
      tag: `family-os-medication-${record.id}-${time.replace(':', '')}`,
    }];
  });
}

function providerNotification(provider: HealthProvider): PendingNotification | null {
  if (!provider.lastVisitDate || !provider.followUpMonths) return null;
  const due = monthsAfter(provider.lastVisitDate, provider.followUpMonths);
  if (!due || due.getTime() > Date.now()) return null;
  const dueDate = isoDate(due);
  return {
    key: `provider-followup:${provider.id}:${dueDate}`,
    title: `${provider.type} follow-up reminder`,
    body: `Your saved ${provider.followUpMonths}-month follow-up interval with ${provider.name} is due. Consider booking an appointment.`,
    tag: `family-os-provider-${provider.id}`,
  };
}

function collectNotifications() {
  const pending = captureRecords.flatMap(record => [...recordNotifications(record), ...medicationNotifications(record)]);
  providers.forEach(provider => {
    const notification = providerNotification(provider);
    if (notification) pending.push(notification);
  });
  return pending;
}

function check() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const seen = new Set(loadSeen());
  for (const item of collectNotifications()) {
    if (seen.has(item.key)) continue;
    try {
      new Notification(item.title, { body: item.body, tag: item.tag });
      remember(item.key);
      seen.add(item.key);
    } catch (error) {
      console.warn('Family OS notification could not be shown.', error);
    }
  }
}

export function installHealthNotificationEngine() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  captureRecords = loadCaptureRecords();
  providers = loadHealthProviders();
  adherence = loadMedicationAdherence();

  unsubscribeCapture = subscribeCaptureRecords(next => {
    captureRecords = next;
    check();
  });
  unsubscribeProviders = subscribeHealthProviders(next => {
    providers = next;
    check();
  });
  unsubscribeAdherence = subscribeMedicationAdherence(next => {
    adherence = next;
    check();
  });

  check();
  timer = window.setInterval(check, CHECK_MS);

  window.addEventListener('beforeunload', () => {
    if (timer != null) window.clearInterval(timer);
    unsubscribeCapture?.();
    unsubscribeProviders?.();
    unsubscribeAdherence?.();
  }, { once: true });
}
