import { captureRecordToCalendarEntry, type CaptureRecord, type LocalCalendarEntry } from './localCaptureStore';

export const SIMPLE_RECURRENCES = ['Does not repeat', 'Weekly', 'Biweekly', 'Monthly', 'Yearly'] as const;
export type SimpleRecurrence = typeof SIMPLE_RECURRENCES[number];

export const RECURRING_VALUES = ['Weekly', 'Biweekly', 'Monthly', 'Every 2 months', 'Quarterly', 'Every 6 months', 'Yearly'] as const;
export type RecurringValue = typeof RECURRING_VALUES[number];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function recordRecurrence(record: CaptureRecord): string {
  const value = record.values.recurrence || (record.kind === 'Bill' ? 'One-time' : 'Does not repeat');
  return value;
}

export function isRecurringRecord(record: CaptureRecord) {
  return (RECURRING_VALUES as readonly string[]).includes(recordRecurrence(record));
}

function addMonthsClamped(base: Date, months: number) {
  const day = base.getDate();
  const result = new Date(base);
  result.setDate(1);
  result.setMonth(base.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

function addYearsClamped(base: Date, years: number) {
  const month = base.getMonth();
  const day = base.getDate();
  const result = new Date(base);
  result.setDate(1);
  result.setFullYear(base.getFullYear() + years);
  result.setMonth(month);
  const lastDay = new Date(result.getFullYear(), month + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

function occurrenceAt(base: Date, recurrence: string, index: number) {
  if (index === 0) return new Date(base);
  const result = new Date(base);
  switch (recurrence) {
    case 'Weekly':
      result.setDate(base.getDate() + index * 7);
      return result;
    case 'Biweekly':
      result.setDate(base.getDate() + index * 14);
      return result;
    case 'Monthly':
      return addMonthsClamped(base, index);
    case 'Every 2 months':
      return addMonthsClamped(base, index * 2);
    case 'Quarterly':
      return addMonthsClamped(base, index * 3);
    case 'Every 6 months':
      return addMonthsClamped(base, index * 6);
    case 'Yearly':
      return addYearsClamped(base, index);
    default:
      return result;
  }
}

export function calendarOccurrencesInRange(record: CaptureRecord, rangeStart: Date, rangeEnd: Date): LocalCalendarEntry[] {
  const base = captureRecordToCalendarEntry(record);
  if (!base) return [];
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();
  const recurrence = recordRecurrence(record);

  if (!isRecurringRecord(record)) {
    const ms = base.start.getTime();
    return ms >= startMs && ms <= endMs ? [base] : [];
  }

  const occurrences: LocalCalendarEntry[] = [];
  // 5000 comfortably covers decades of weekly events while preventing malformed data from looping forever.
  for (let index = 0; index < 5000; index += 1) {
    const start = occurrenceAt(base.start, recurrence, index);
    const ms = start.getTime();
    if (ms > endMs) break;
    if (ms < startMs) continue;
    occurrences.push({
      ...base,
      id: `local:${record.id}:${dateKey(start)}`,
      start,
    });
  }
  return occurrences;
}

export function nextRecurringOccurrence(record: CaptureRecord, from: Date, through: Date) {
  return calendarOccurrencesInRange(record, from, through)[0] ?? null;
}
