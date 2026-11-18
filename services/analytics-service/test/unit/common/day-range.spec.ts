import { BadRequestException } from '@nestjs/common';
import { parseOptionalDayRange } from '../../../src/common/day-range.js';

describe('parseOptionalDayRange (plan 90, phase 7, step 10)', () => {
  it('leaves either end open', () => {
    expect(parseOptionalDayRange(undefined, undefined)).toEqual({ from: null, to: null });
    expect(parseOptionalDayRange('2026-10-01', undefined)).toEqual({ from: '2026-10-01', to: null });
    expect(parseOptionalDayRange('', '2026-11-14')).toEqual({ from: null, to: '2026-11-14' });
  });

  it('has no length cap', () => {
    expect(parseOptionalDayRange('2024-01-01', '2026-11-14')).toEqual({ from: '2024-01-01', to: '2026-11-14' });
  });

  it('refuses a non-day and a reversed range', () => {
    expect(() => parseOptionalDayRange('2026-02-30', undefined)).toThrow(BadRequestException);
    expect(() => parseOptionalDayRange(undefined, '14.11.2026')).toThrow(BadRequestException);
    expect(() => parseOptionalDayRange('2026-11-15', '2026-11-14')).toThrow(BadRequestException);
  });
});
