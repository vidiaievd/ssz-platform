import {
  buildPlanItems,
  layoutPlan,
  occurrenceKey,
  slotOccurrences,
  type OutlineUnit,
  type PlanSlot,
} from './session-plan.js';

const slot = (weekday: PlanSlot['weekday'], startTime = '09:00'): PlanSlot => ({
  id: `slot-${weekday}-${startTime}`,
  weekday,
  startTime,
  endTime: '10:30',
  room: 'Room 4',
});

const unit = (id: string, order: number, itemTypes: string[]): OutlineUnit => ({
  id,
  order,
  items: itemTypes.map((itemType, i) => ({ id: `${id}-i${i}`, itemType })),
});

const dates = (sessions: Array<{ date: Date }>) =>
  sessions.map((s) => s.date.toISOString().slice(0, 10));

describe('buildPlanItems', () => {
  it('gives every lesson its own session and closes each unit with a checkpoint', () => {
    const items = buildPlanItems([
      unit('u1', 1, ['lesson', 'vocabulary_list', 'lesson']),
      unit('u2', 2, ['lesson']),
    ]);

    expect(items.map((i) => [i.type, i.contentUnitId, i.contentLessonId])).toEqual([
      ['lesson', 'u1', 'u1-i0'],
      ['lesson', 'u1', 'u1-i2'],
      ['exam', 'u1', null],
      ['lesson', 'u2', 'u2-i0'],
      ['exam', 'u2', null],
    ]);
  });

  it('leaves word lists, rules and exercises out of the plan', () => {
    const items = buildPlanItems([
      unit('u1', 1, ['lesson', 'vocabulary_list', 'grammar_rule', 'exercise', 'exercise']),
    ]);

    expect(items.filter((i) => i.type === 'lesson')).toHaveLength(1);
  });

  it('still plans a session for a unit that holds no lessons at all', () => {
    const items = buildPlanItems([unit('grammar-unit', 1, ['grammar_rule', 'exercise'])]);

    expect(items).toEqual([
      { planIndex: 0, type: 'lesson', contentUnitId: 'grammar-unit', contentLessonId: null },
      { planIndex: 1, type: 'exam', contentUnitId: 'grammar-unit', contentLessonId: null },
    ]);
  });

  it('numbers items by plan position and follows unit order, not array order', () => {
    const items = buildPlanItems([unit('second', 2, ['lesson']), unit('first', 1, ['lesson'])]);

    expect(items.map((i) => [i.planIndex, i.contentUnitId])).toEqual([
      [0, 'first'],
      [1, 'first'],
      [2, 'second'],
      [3, 'second'],
    ]);
  });
});

describe('slotOccurrences', () => {
  it('walks the weekly pattern in calendar order', () => {
    // 2026-09-07 is a Monday.
    const found = slotOccurrences([slot('tue'), slot('thu')], new Date('2026-09-07T00:00:00Z'), 5);

    expect(dates(found)).toEqual(['2026-09-08', '2026-09-10', '2026-09-15', '2026-09-17', '2026-09-22']);
  });

  it('starts on the first slot that has not gone by yet', () => {
    // Course starts on a Wednesday; Tuesday has already passed this week.
    const found = slotOccurrences([slot('tue'), slot('thu')], new Date('2026-09-09T00:00:00Z'), 3);

    expect(dates(found)).toEqual(['2026-09-10', '2026-09-15', '2026-09-17']);
  });

  it('orders same-week slots by weekday, then by time', () => {
    const found = slotOccurrences(
      [slot('thu', '18:00'), slot('tue', '18:00'), slot('tue', '09:00')],
      new Date('2026-09-07T00:00:00Z'),
      3,
    );

    expect(found.map((f) => [f.date.toISOString().slice(0, 10), f.slot.startTime])).toEqual([
      ['2026-09-08', '09:00'],
      ['2026-09-08', '18:00'],
      ['2026-09-10', '18:00'],
    ]);
  });

  it('steps over an occurrence that is already taken', () => {
    const taken = new Set([occurrenceKey(new Date('2026-09-10T00:00:00Z'), '09:00')]);
    const found = slotOccurrences([slot('tue'), slot('thu')], new Date('2026-09-07T00:00:00Z'), 3, taken);

    expect(dates(found)).toEqual(['2026-09-08', '2026-09-15', '2026-09-17']);
  });

  it('returns nothing when there is no pattern to walk', () => {
    expect(slotOccurrences([], new Date('2026-09-07T00:00:00Z'), 5)).toEqual([]);
  });
});

describe('layoutPlan', () => {
  const threeUnits = [
    unit('u1', 1, ['lesson', 'lesson']),
    unit('u2', 2, ['lesson']),
    unit('u3', 3, ['lesson']),
  ];

  it('lays two sessions a week onto two slots', () => {
    const planned = layoutPlan(
      buildPlanItems(threeUnits),
      [slot('tue'), slot('thu')],
      new Date('2026-09-07T00:00:00Z'),
    );

    expect(planned).toHaveLength(7);
    expect(dates(planned)).toEqual([
      '2026-09-08', '2026-09-10',
      '2026-09-15', '2026-09-17',
      '2026-09-22', '2026-09-24',
      '2026-09-29',
    ]);
    expect(planned.map((p) => p.type)).toEqual([
      'lesson', 'lesson', 'exam', 'lesson', 'exam', 'lesson', 'exam',
    ]);
  });

  it('packs three sessions into a three-slot week', () => {
    const planned = layoutPlan(
      buildPlanItems(threeUnits),
      [slot('mon'), slot('wed'), slot('fri')],
      new Date('2026-09-07T00:00:00Z'),
    );

    expect(dates(planned).slice(0, 4)).toEqual([
      '2026-09-07', '2026-09-09', '2026-09-11', '2026-09-14',
    ]);
  });

  it('carries the slot time and room onto each session', () => {
    const [first] = layoutPlan(
      buildPlanItems([unit('u1', 1, ['lesson'])]),
      [slot('tue')],
      new Date('2026-09-07T00:00:00Z'),
    );

    expect(first).toMatchObject({ contentUnitId: 'u1', contentLessonId: 'u1-i0' });
    expect(first!.slot).toMatchObject({ startTime: '09:00', endTime: '10:30', room: 'Room 4' });
  });

  it('runs past the term rather than dropping the tail — a course that does not fit says so', () => {
    const manyUnits = Array.from({ length: 20 }, (_, i) => unit(`u${i}`, i + 1, ['lesson']));
    const planned = layoutPlan(
      buildPlanItems(manyUnits),
      [slot('tue')],
      new Date('2026-09-07T00:00:00Z'),
    );

    expect(planned).toHaveLength(40);
    expect(planned.at(-1)!.date.getUTCFullYear()).toBe(2027);
  });

  it('plans nothing when the course has no units', () => {
    expect(layoutPlan(buildPlanItems([]), [slot('tue')], new Date('2026-09-07T00:00:00Z'))).toEqual([]);
  });
});
