import { jest } from '@jest/globals';
import { GetReviewEffortHandler } from '../../../src/modules/attempts/application/queries/get-review-effort/get-review-effort.handler.js';
import { GetReviewEffortQuery } from '../../../src/modules/attempts/application/queries/get-review-effort/get-review-effort.query.js';
import {
  REVIEW_EFFORT_MIN_SAMPLE,
  resolveReviewEffortNorms,
  type StartingReviewMinutes,
} from '../../../src/modules/attempts/domain/value-objects/review-effort-norm.js';

/** As organization-service answers: one figure the school set, the rest factory. */
const starting: StartingReviewMinutes = {
  templates: [
    { templateCode: 'read_aloud', minutes: 5, source: 'default' },
    { templateCode: 'short_answer', minutes: 2, source: 'default' },
    { templateCode: 'writing_task', minutes: 20, source: 'school' },
  ],
  other: { minutes: 3, source: 'default' },
};

describe('resolveReviewEffortNorms', () => {
  it("takes the school's starting minutes while it has no history, saying whose they are", () => {
    expect(resolveReviewEffortNorms(['read_aloud', 'writing_task'], [], starting)).toEqual([
      { templateCode: 'read_aloud', minutesPerSubmission: 5, source: 'default', sampleSize: 0 },
      { templateCode: 'writing_task', minutesPerSubmission: 20, source: 'school', sampleSize: 0 },
    ]);
  });

  it('keeps the starting minutes one verdict short of the sample, and says how many there are', () => {
    const [norm] = resolveReviewEffortNorms(
      ['writing_task'],
      [
        {
          templateCode: 'writing_task',
          sampleSize: REVIEW_EFFORT_MIN_SAMPLE - 1,
          medianSeconds: 600,
        },
      ],
      starting,
    );

    expect(norm).toEqual({
      templateCode: 'writing_task',
      minutesPerSubmission: 20,
      source: 'school',
      sampleSize: REVIEW_EFFORT_MIN_SAMPLE - 1,
    });
  });

  it("switches to the median at the sample, over the school's own setting", () => {
    const [norm] = resolveReviewEffortNorms(
      ['writing_task'],
      [{ templateCode: 'writing_task', sampleSize: REVIEW_EFFORT_MIN_SAMPLE, medianSeconds: 135 }],
      starting,
    );

    expect(norm).toEqual({
      templateCode: 'writing_task',
      minutesPerSubmission: 2.3,
      source: 'history',
      sampleSize: REVIEW_EFFORT_MIN_SAMPLE,
    });
  });

  it('gives a template on neither list the "other" figure', () => {
    const [norm] = resolveReviewEffortNorms(['some_new_template'], [], {
      ...starting,
      other: { minutes: 7, source: 'school' },
    });

    expect(norm.minutesPerSubmission).toBe(7);
    expect(norm.source).toBe('school');
  });

  it('reports a template with history and nothing waiting, once per code, sorted', () => {
    const norms = resolveReviewEffortNorms(
      ['writing_task', 'read_aloud', 'writing_task'],
      [{ templateCode: 'error_correction', sampleSize: 40, medianSeconds: 90 }],
      starting,
    );

    expect(norms.map((norm) => norm.templateCode)).toEqual([
      'error_correction',
      'read_aloud',
      'writing_task',
    ]);
  });
});

describe('GetReviewEffortHandler', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-25T12:00:00Z') });
  });
  afterEach(() => jest.useRealTimers());

  const pending = [
    { groupId: 'group-1', templateCode: 'writing_task', count: 3 },
    { groupId: null, templateCode: 'read_aloud', count: 1 },
  ];

  const setup = (minutes: () => Promise<StartingReviewMinutes | null>) => {
    const countPendingByGroupAndTemplate = jest.fn((..._args: unknown[]) =>
      Promise.resolve(pending),
    );
    const findHandlingTimeStats = jest.fn((..._args: unknown[]) =>
      Promise.resolve([{ templateCode: 'writing_task', sampleSize: 25, medianSeconds: 480 }]),
    );
    const schoolReviewEffortMinutes = jest.fn((..._args: unknown[]) => minutes());
    const handler = new GetReviewEffortHandler(
      { countPendingByGroupAndTemplate, findHandlingTimeStats } as never,
      { schoolReviewEffortMinutes } as never,
    );
    return {
      handler,
      countPendingByGroupAndTemplate,
      findHandlingTimeStats,
      schoolReviewEffortMinutes,
    };
  };

  it("reads the queue, ninety days of handling times and the school's minutes, and puts a norm on every template", async () => {
    const {
      handler,
      countPendingByGroupAndTemplate,
      findHandlingTimeStats,
      schoolReviewEffortMinutes,
    } = setup(() => Promise.resolve(starting));

    const result = await handler.execute(new GetReviewEffortQuery('school-1'));

    expect(countPendingByGroupAndTemplate).toHaveBeenCalledWith('school-1');
    expect(findHandlingTimeStats).toHaveBeenCalledWith(
      'school-1',
      new Date('2026-07-27T12:00:00Z'),
    );
    expect(schoolReviewEffortMinutes).toHaveBeenCalledWith('school-1');
    expect(result.value).toEqual({
      pending,
      norms: [
        { templateCode: 'read_aloud', minutesPerSubmission: 5, source: 'default', sampleSize: 0 },
        { templateCode: 'writing_task', minutesPerSubmission: 8, source: 'history', sampleSize: 25 },
      ],
      historyDays: 90,
      minSample: REVIEW_EFFORT_MIN_SAMPLE,
    });
  });

  it('fails as not found when organization-service has no such school', async () => {
    const { handler } = setup(() => Promise.resolve(null));

    const result = await handler.execute(new GetReviewEffortQuery('school-1'));

    expect(result.isFail).toBe(true);
    expect(result.error).toEqual({ code: 'SCHOOL_NOT_FOUND' });
  });

  it('fails rather than answering with history alone when organization-service is down', async () => {
    const { handler } = setup(() => Promise.reject(new Error('connect ECONNREFUSED')));

    const result = await handler.execute(new GetReviewEffortQuery('school-1'));

    expect(result.isFail).toBe(true);
    expect(result.error).toEqual({ code: 'STARTING_MINUTES_UNAVAILABLE' });
  });
});
