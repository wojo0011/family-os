import { describe, expect, it } from 'vitest';
import * as Astronomy from 'astronomy-engine';
import { validateCaptureValues } from './localCaptureStore';

describe('Family OS foundation', () => {
  it('calculates a deterministic lunar phase angle', () => {
    const angle = Astronomy.MoonPhase(new Date('2026-08-16T12:00:00Z'));
    expect(Number.isFinite(angle)).toBe(true);
    expect(angle).toBeGreaterThanOrEqual(0);
    expect(angle).toBeLessThan(360);
  });

  it('finds a future moon quarter', () => {
    const quarter = Astronomy.SearchMoonQuarter(new Date('2026-08-16T12:00:00Z'));
    expect(quarter).toBeTruthy();
    expect(quarter!.time.date.getTime()).toBeGreaterThan(new Date('2026-08-16T12:00:00Z').getTime());
  });

  it('validates a complete household bill', () => {
    const result = validateCaptureValues('Bill', {
      bill: 'Hydro',
      amount: '187.42',
      dueDate: '2026-08-20',
      status: 'Unpaid',
      category: 'Utilities',
      recurrence: 'Monthly',
      person: 'Family',
      autopay: 'Yes',
      paidDate: '',
      account: 'TEST-001',
      notes: '',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('rejects malformed money values and accepts linked receipt metadata', () => {
    const badBill = validateCaptureValues('Bill', {
      bill: '', amount: '-10', dueDate: 'not-a-date', status: 'Unknown', category: 'Utilities', recurrence: 'Monthly', person: 'Family', autopay: 'No',
    });
    expect(badBill.valid).toBe(false);
    expect(badBill.errors.bill).toBeTruthy();
    expect(badBill.errors.amount).toBeTruthy();
    expect(badBill.errors.dueDate).toBeTruthy();
    expect(badBill.errors.status).toBeTruthy();

    const receipt = validateCaptureValues('Scan receipt', {
      merchant: 'Hydro', amount: '187.42', subtotal: '165.86', tax: '21.56', tip: '0', date: '2026-08-18', category: 'Utilities', person: 'Family', paymentMethod: 'Bank transfer', linkedBillId: 'capture-bill-1', receipt: 'hydro.pdf', notes: '',
    });
    expect(receipt.valid).toBe(true);
    expect(receipt.values.linkedBillId).toBe('capture-bill-1');
  });
});
