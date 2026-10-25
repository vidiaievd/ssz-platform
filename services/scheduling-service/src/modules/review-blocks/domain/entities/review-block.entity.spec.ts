import {
  ReviewBlock,
  checkReviewBlockShape,
  type ReviewBlockRepeat,
} from './review-block.entity.js';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const block = (
  repeat: ReviewBlockRepeat,
  startsOn: string,
  endsOn: string | null,
  skips: string[] = [],
) =>
  new ReviewBlock(
    'b1',
    'school-1',
    'teacher-1',
    repeat,
    d(startsOn),
    endsOn === null ? null : d(endsOn),
    '16:00',
    '17:30',
    null,
    'teacher-1',
    d('2026-10-01'),
    d('2026-10-01'),
    new Set(skips),
  );

const days = (b: ReviewBlock, from: string, to: string) =>
  b.occurrencesBetween(d(from), d(to)).map((o) => o.date.toISOString().slice(0, 10));

describe('ReviewBlock.occurrencesBetween', () => {
  it('lands a weekly series on the weekday of its first day', () => {
    // 2026-10-27 is a Tuesday.
    expect(days(block('weekly', '2026-10-27', null), '2026-10-26', '2026-11-15')).toEqual([
      '2026-10-27',
      '2026-11-03',
      '2026-11-10',
    ]);
  });

  it('starts mid-series on the next sitting, not on the first day of the window', () => {
    expect(days(block('weekly', '2026-10-06', null), '2026-10-22', '2026-11-04')).toEqual([
      '2026-10-27',
      '2026-11-03',
    ]);
  });

  it('counts both ends of the window and of the series', () => {
    const b = block('weekly', '2026-10-06', '2026-10-20');
    expect(days(b, '2026-10-06', '2026-10-20')).toEqual(['2026-10-06', '2026-10-13', '2026-10-20']);
    expect(days(b, '2026-10-21', '2026-12-31')).toEqual([]);
  });

  it('leaves skipped days out and keeps the rest of the series', () => {
    const b = block('weekly', '2026-10-06', null, ['2026-10-13']);
    expect(days(b, '2026-10-01', '2026-10-25')).toEqual(['2026-10-06', '2026-10-20']);
  });

  it('gives a one-off its single day, and nothing outside it', () => {
    const b = block('one_off', '2026-10-29', '2026-10-29');
    expect(days(b, '2026-10-26', '2026-11-01')).toEqual(['2026-10-29']);
    expect(days(b, '2026-10-30', '2026-11-01')).toEqual([]);
    expect(days(b, '2026-10-01', '2026-10-28')).toEqual([]);
  });

  it('carries the block on every sitting', () => {
    const [first] = block('one_off', '2026-10-29', '2026-10-29').occurrencesBetween(
      d('2026-10-29'),
      d('2026-10-29'),
    );
    expect(first).toEqual({
      blockId: 'b1',
      schoolId: 'school-1',
      teacherId: 'teacher-1',
      repeat: 'one_off',
      date: d('2026-10-29'),
      startTime: '16:00',
      endTime: '17:30',
      note: null,
    });
  });

  it('reads a window given in the middle of a day as whole days', () => {
    const b = block('one_off', '2026-10-29', '2026-10-29');
    expect(
      b.occurrencesBetween(new Date('2026-10-29T18:00:00Z'), new Date('2026-10-29T19:00:00Z')),
    ).toHaveLength(1);
  });

  it('knows how long one sitting is', () => {
    expect(block('weekly', '2026-10-06', null).durationMinutes).toBe(90);
  });
});

describe('checkReviewBlockShape', () => {
  const shape = {
    repeat: 'weekly' as ReviewBlockRepeat,
    startsOn: d('2026-10-27'),
    endsOn: null as Date | null,
    startTime: '16:00',
    endTime: '17:30',
  };

  it('accepts an open weekly series and a one-off of one day', () => {
    expect(checkReviewBlockShape(shape)).toBeNull();
    expect(
      checkReviewBlockShape({ ...shape, repeat: 'one_off', endsOn: d('2026-10-27') }),
    ).toBeNull();
  });

  it('rejects malformed times and a block that does not move forward', () => {
    expect(checkReviewBlockShape({ ...shape, startTime: '9:00' })).toBe('INVALID_TIME');
    expect(checkReviewBlockShape({ ...shape, endTime: '24:00' })).toBe('INVALID_TIME');
    expect(checkReviewBlockShape({ ...shape, endTime: '16:00' })).toBe('END_TIME_NOT_AFTER_START');
    expect(checkReviewBlockShape({ ...shape, startTime: '23:00', endTime: '01:00' })).toBe(
      'END_TIME_NOT_AFTER_START',
    );
  });

  it('rejects a series that ends before it starts', () => {
    expect(checkReviewBlockShape({ ...shape, endsOn: d('2026-10-20') })).toBe('ENDS_BEFORE_START');
  });

  it('rejects a one-off without an end or spanning several days', () => {
    expect(checkReviewBlockShape({ ...shape, repeat: 'one_off' })).toBe('ONE_OFF_SPANS_DAYS');
    expect(
      checkReviewBlockShape({ ...shape, repeat: 'one_off', endsOn: d('2026-10-28') }),
    ).toBe('ONE_OFF_SPANS_DAYS');
  });
});
