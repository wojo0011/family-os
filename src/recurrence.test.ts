import { describe, expect, it } from 'vitest';
import { calendarOccurrencesInRange } from './recurrence';
import type { CaptureRecord } from './localCaptureStore';

function eventRecord(recurrence: string, date = '2026-01-01'): CaptureRecord {
  return {
    id: `event-${recurrence}`,
    kind: 'Event',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    values: {
      title: 'Recurring test',
      date,
      time: '09:00',
      person: 'Family',
      category: 'Family',
      recurrence,
    },
  };
}

const keys = (record: CaptureRecord, start: string, end: string) =>
  calendarOccurrencesInRange(record, new Date(`${start}T00:00:00`), new Date(`${end}T23:59:59`))
    .map(item => `${item.start.getFullYear()}-${String(item.start.getMonth() + 1).padStart(2, '0')}-${String(item.start.getDate()).padStart(2, '0')}`);

describe('Family OS recurrence engine', () => {
  it('expands weekly and biweekly schedules', () => {
    expect(keys(eventRecord('Weekly'), '2026-01-01', '2026-01-31')).toEqual([
      '2026-01-01', '2026-01-08', '2026-01-15', '2026-01-22', '2026-01-29',
    ]);
    expect(keys(eventRecord('Biweekly'), '2026-01-01', '2026-01-31')).toEqual([
      '2026-01-01', '2026-01-15', '2026-01-29',
    ]);
  });

  it('keeps month-end events at the end of shorter months', () => {
    expect(keys(eventRecord('Monthly', '2026-01-31'), '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
    ]);
  });

  it('clamps leap-day yearly events safely', () => {
    expect(keys(eventRecord('Yearly', '2024-02-29'), '2024-01-01', '2026-12-31')).toEqual([
      '2024-02-29', '2025-02-28', '2026-02-28',
    ]);
  });

  it('expands recurring bills from their due date', () => {
    const bill: CaptureRecord = {
      id: 'bill-monthly',
      kind: 'Bill',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      values: {
        bill: 'Hydro', amount: '100', dueDate: '2026-01-15', status: 'Unpaid', category: 'Utilities',
        recurrence: 'Monthly', person: 'Family', autopay: 'No',
      },
    };
    expect(keys(bill, '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15',
    ]);
  });
});
