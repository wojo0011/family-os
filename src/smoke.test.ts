import { describe, expect, it } from 'vitest';
import * as Astronomy from 'astronomy-engine';

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
});
