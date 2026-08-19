import { loadCaptureRecords, subscribeCaptureRecords, type CaptureRecord } from './localCaptureStore';
import { calendarOccurrencesInRange, isRecurringRecord } from './recurrence';

const SEEN_KEY = 'family-os:recurring-notification-seen-v1';
const CHECK_MS = 60_000;
const MAX_SEEN = 300;

let installed = false;
let timer: number | null = null;
let records: CaptureRecord[] = [];
let unsubscribe: (() => void) | null = null;

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

function bucket(msUntil: number) {
  if (msUntil <= 2 * 60 * 60 * 1000) return '2h';
  if (msUntil <= 24 * 60 * 60 * 1000) return '24h';
  return null;
}

function notificationFor(record: CaptureRecord) {
  if (!isRecurringRecord(record) || (record.kind !== 'Reminder' && record.kind !== 'Event')) return null;
  if (record.kind === 'Event') {
    const category = (record.values.category || '').toLowerCase();
    if (!['appointment', 'medical', 'dental'].includes(category)) return null;
  }

  const now = new Date();
  const from = new Date(now.getTime() - 60_000);
  const through = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const occurrence = calendarOccurrencesInRange(record, from, through)[0];
  if (!occurrence) return null;

  // The original occurrence is already handled by the existing notification engine.
  const baseDate = record.values.date || record.values.dueDate || '';
  if (dateKey(occurrence.start) === baseDate) return null;

  const msUntil = occurrence.start.getTime() - now.getTime();
  const timeBucket = bucket(msUntil);
  if (!timeBucket) return null;
  const occurrenceDate = dateKey(occurrence.start);
  const time = `${String(occurrence.start.getHours()).padStart(2, '0')}:${String(occurrence.start.getMinutes()).padStart(2, '0')}`;

  if (record.kind === 'Reminder') {
    const title = record.values.title || 'Reminder';
    return {
      key: `recurring-reminder:${record.id}:${occurrenceDate}:${timeBucket}`,
      title: timeBucket === '2h' ? `Reminder soon · ${title}` : `Reminder tomorrow · ${title}`,
      body: `${occurrenceDate} at ${time}${record.values.person ? ` · ${record.values.person}` : ''}`,
      tag: `family-os-recurring-reminder-${record.id}`,
    };
  }

  const title = record.values.title || 'Appointment';
  return {
    key: `recurring-appointment:${record.id}:${occurrenceDate}:${timeBucket}`,
    title: timeBucket === '2h' ? `Appointment coming up · ${title}` : `Appointment tomorrow · ${title}`,
    body: `${occurrenceDate} at ${time}${record.values.location ? ` · ${record.values.location}` : ''}`,
    tag: `family-os-recurring-appointment-${record.id}`,
  };
}

function check() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const seen = new Set(loadSeen());
  for (const record of records) {
    const item = notificationFor(record);
    if (!item || seen.has(item.key)) continue;
    try {
      new Notification(item.title, { body: item.body, tag: item.tag });
      remember(item.key);
      seen.add(item.key);
    } catch (error) {
      console.warn('Family OS recurring notification could not be shown.', error);
    }
  }
}

export function installRecurringNotificationEnhancement() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  records = loadCaptureRecords();
  unsubscribe = subscribeCaptureRecords(next => {
    records = next;
    check();
  });
  check();
  timer = window.setInterval(check, CHECK_MS);
  window.addEventListener('beforeunload', () => {
    if (timer != null) window.clearInterval(timer);
    unsubscribe?.();
  }, { once: true });
}
