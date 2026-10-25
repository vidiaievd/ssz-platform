import { jest } from '@jest/globals';
import { GetReviewEffortHandler } from '../../../src/modules/attempts/application/queries/get-review-effort/get-review-effort.handler.js';
import { GetReviewEffortQuery } from '../../../src/modules/attempts/application/queries/get-review-effort/get-review-effort.query.js';
import {
  DEFAULT_REVIEW_MINUTES,
  FALLBACK_REVIEW_MINUTES,
  REVIEW_EFFORT_MIN_SAMPLE,
  resolveReviewEffortNorms,
} from '../../../src/modules/attempts/domain/value-objects/review-effort-norm.js';

describe('resolveReviewEffortNorms', () => {
  it('takes the constant while the school has no history', () => {
    expect(resolveReviewEffortNorms(['writing_task'], [])).toEqual([
      {
        templateCode: 'writing_task',
        minutesPerSubmission: DEFAULT_REVIEW_MINUTES.writing_task,
        source: 'default',
        sampleSize: 0,
      },
    ]);
  });

  it('keeps the constant one verdict short of the sample, and says how many there are', () => {
    const [norm] = resolveReviewEffortNorms(
      ['short_answer'],
      [
        {
          templateCode: 'short_answer',
          sampleSize: REVIEW_EFFORT_MIN_SAMPLE - 1,
          medianSeconds: 600,
        },
      ],
    );

    expect(norm).toEqual({
      templateCode: 'short_answer',
      minutesPerSubmission: DEFAULT_REVIEW_MINUTES.short_answer,
      source: 'default',
      sampleSize: REVIEW_EFFORT_MIN_SAMPLE - 1,
    });
  });

  it('switches to the median at the sample, in minutes to one decimal', () => {
    const [norm] = resolveReviewEffortNorms(
      ['short_answer'],
      [{ templateCode: 'short_answer', sampleSize: REVIEW_EFFORT_MIN_SAMPLE, medianSeconds: 135 }],
    );

    expect(norm).toEqual({
      templateCode: 'short_answer',
      minutesPerSubmission: 2.3,
      source: 'history',
      sampleSize: REVIEW_EFFORT_MIN_SAMPLE,
    });
  });

  it('gives a template with no constant the fallback', () => {
    const [norm] = resolveReviewEffortNorms(['some_new_template'], []);

    expect(norm.minutesPerSubmission).toBe(FALLBACK_REVIEW_MINUTES);
    expect(norm.source).toBe('default');
  });

  it('reports a template with history and nothing waiting, once per code, sorted', () => {
    const norms = resolveReviewEffortNorms(
      ['writing_task', 'read_aloud', 'writing_task'],
      [{ templateCode: 'error_correction', sampleSize: 40, medianSeconds: 90 }],
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

  it('reads the queue and ninety days of handling times, and puts a norm on every template', async () => {
    const pending = [
      { groupId: 'group-1', templateCode: 'writing_task', count: 3 },
      { groupId: null, templateCode: 'read_aloud', count: 1 },
    ];
    const countPendingByGroupAndTemplate = jest.fn((..._args: unknown[]) =>
      Promise.resolve(pending),
    );
    const findHandlingTimeStats = jest.fn((..._args: unknown[]) =>
      Promise.resolve([{ templateCode: 'writing_task', sampleSize: 25, medianSeconds: 480 }]),
    );
    const handler = new GetReviewEffortHandler({
      countPendingByGroupAndTemplate,
      findHandlingTimeStats,
    } as never);

    const result = await handler.execute(new GetReviewEffortQuery('school-1'));

    expect(countPendingByGroupAndTemplate).toHaveBeenCalledWith('school-1');
    expect(findHandlingTimeStats).toHaveBeenCalledWith(
      'school-1',
      new Date('2026-07-27T12:00:00Z'),
    );
    expect(result).toEqual({
      pending,
      norms: [
        {
          templateCode: 'read_aloud',
          minutesPerSubmission: DEFAULT_REVIEW_MINUTES.read_aloud,
          source: 'default',
          sampleSize: 0,
        },
        {
          templateCode: 'writing_task',
          minutesPerSubmission: 8,
          source: 'history',
          sampleSize: 25,
        },
      ],
      historyDays: 90,
      minSample: REVIEW_EFFORT_MIN_SAMPLE,
    });
  });
});
