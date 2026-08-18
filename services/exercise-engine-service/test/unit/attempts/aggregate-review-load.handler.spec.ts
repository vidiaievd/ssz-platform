import { jest } from '@jest/globals';
import {
  AggregateReviewLoadHandler,
  MAX_LOAD_ROWS,
} from '../../../src/modules/attempts/application/queries/aggregate-review-load/aggregate-review-load.handler.js';
import { AggregateReviewLoadQuery } from '../../../src/modules/attempts/application/queries/aggregate-review-load/aggregate-review-load.query.js';
import type {
  PendingLoadRow,
  ReviewedLoadRow,
} from '../../../src/modules/attempts/domain/repositories/attempt.repository.js';

const SCHOOL = 'school-1';
const HORIZON = new Date('2026-06-01T08:00:00Z');

function pending(overrides: Partial<PendingLoadRow> = {}): PendingLoadRow {
  return {
    attemptId: 'att-1',
    userId: 'student-1',
    exerciseId: 'ex-1',
    containerId: 'course-1',
    groupId: 'group-1',
    submittedAt: new Date('2026-08-17T09:00:00Z'),
    ...overrides,
  };
}

function reviewed(overrides: Partial<ReviewedLoadRow> = {}): ReviewedLoadRow {
  return {
    reviewerId: 'teacher-1',
    containerId: 'course-1',
    groupId: 'group-1',
    submittedAt: new Date('2026-08-17T09:00:00Z'),
    reviewedAt: new Date('2026-08-17T13:30:00Z'),
    ...overrides,
  };
}

function makeHandler(rows: { pending?: PendingLoadRow[]; reviewed?: ReviewedLoadRow[] }) {
  const attempts = {
    findPendingLoad: jest.fn(() => Promise.resolve(rows.pending ?? [])),
    findReviewedLoad: jest.fn(() => Promise.resolve(rows.reviewed ?? [])),
    earliestSubmissionAt: jest.fn(() => Promise.resolve(HORIZON)),
  };
  return { handler: new AggregateReviewLoadHandler(attempts as never), attempts };
}

const query = (periodDays = 30) => new AggregateReviewLoadQuery(SCHOOL, periodDays);

describe('AggregateReviewLoadHandler', () => {
  it('groups what is waiting by course and group, keeping every submission time', async () => {
    const { handler } = makeHandler({
      pending: [
        pending({ attemptId: 'a', submittedAt: new Date('2026-08-17T09:00:00Z') }),
        pending({ attemptId: 'b', submittedAt: new Date('2026-08-17T10:00:00Z') }),
        pending({ attemptId: 'c', groupId: 'group-2' }),
      ],
    });

    const result = await handler.execute(query());

    expect(result.pending).toHaveLength(2);
    // Not a min and a mean: the age histogram cannot be rebuilt from those.
    expect(result.pending[0]!.submittedAt).toEqual([
      new Date('2026-08-17T09:00:00Z'),
      new Date('2026-08-17T10:00:00Z'),
    ]);
    expect(result.pending[1]).toMatchObject({ groupId: 'group-2' });
  });

  it('reports how long each verdict took, per reviewer and course', async () => {
    const { handler } = makeHandler({
      reviewed: [
        reviewed(),
        reviewed({ reviewedAt: new Date('2026-08-18T09:00:00Z') }),
        reviewed({ reviewerId: 'teacher-2' }),
      ],
    });

    const result = await handler.execute(query());

    expect(result.reviewed).toHaveLength(2);
    expect(result.reviewed[0]).toMatchObject({
      reviewerId: 'teacher-1',
      durationsHours: [4.5, 24],
    });
    expect(result.reviewed[1]!.reviewerId).toBe('teacher-2');
  });

  /** The median and "overdue" belong to whoever knows the promised response time (§0.1). */
  it('reports no median, no overdue and no names', async () => {
    const { handler } = makeHandler({ pending: [pending()], reviewed: [reviewed()] });

    const result = await handler.execute(query());

    expect(Object.keys(result).sort()).toEqual([
      'pending',
      'reviewed',
      'since',
      'truncated',
      'unassigned',
    ]);
  });

  /** A submission nobody is responsible for is the finding oversight is looking for. */
  it('names the submissions no group answers for', async () => {
    const { handler } = makeHandler({
      pending: [pending({ attemptId: 'a' }), pending({ attemptId: 'b', groupId: null })],
    });

    const result = await handler.execute(query());

    expect(result.unassigned).toEqual([
      {
        attemptId: 'b',
        userId: 'student-1',
        exerciseId: 'ex-1',
        submittedAt: new Date('2026-08-17T09:00:00Z'),
      },
    ]);
    // Still part of the load it belongs to, under a null group.
    expect(result.pending.some((entry) => entry.groupId === null)).toBe(true);
  });

  it('answers with the school’s own horizon rather than the period asked for', async () => {
    const { handler } = makeHandler({});

    const result = await handler.execute(query(7));

    expect(result.since).toEqual(HORIZON);
  });

  /**
   * The period bounds delivered verdicts only. A submission from two months ago that
   * nobody has answered is exactly what this screen exists to surface.
   */
  it('bounds the verdicts by the period and leaves the backlog unbounded', async () => {
    const { handler, attempts } = makeHandler({});

    await handler.execute(query(7));

    const [, since] = attempts.findReviewedLoad.mock.calls[0]!;
    const days = (Date.now() - (since as Date).getTime()) / 86_400_000;
    expect(days).toBeCloseTo(7, 1);
    expect(attempts.findPendingLoad).toHaveBeenCalledWith(SCHOOL, MAX_LOAD_ROWS + 1);
  });

  it('says so when a school is bigger than one page of oversight', async () => {
    const { handler } = makeHandler({
      pending: Array.from({ length: MAX_LOAD_ROWS + 1 }, (_, i) =>
        pending({ attemptId: `att-${i}` }),
      ),
    });

    const result = await handler.execute(query());

    expect(result.truncated).toBe(true);
    expect(result.pending[0]!.submittedAt).toHaveLength(MAX_LOAD_ROWS);
  });

  it('is not truncated when the school fits', async () => {
    const { handler } = makeHandler({ pending: [pending()], reviewed: [reviewed()] });

    expect((await handler.execute(query())).truncated).toBe(false);
  });

  /** A duration measured from nothing would pull a school's median down. */
  it('drops a verdict whose submission has no time rather than counting it as instant', async () => {
    const { handler } = makeHandler({ reviewed: [reviewed({ submittedAt: null })] });

    expect((await handler.execute(query())).reviewed).toEqual([]);
  });
});
