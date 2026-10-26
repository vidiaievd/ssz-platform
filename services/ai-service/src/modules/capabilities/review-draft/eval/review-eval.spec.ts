import { NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import type { QueryBus } from '@nestjs/cqrs';
import type { ModelCaller, NamedModelCall } from '../../../gateway/application/model-caller.js';
import { LlmError } from '../../../providers/domain/llm-error.js';
import type { ModelFeatures } from '../../../providers/domain/model-features.js';
import type { ModelForCall } from '../../../registry/application/ports/registry.reader.js';
import { Result } from '../../../../shared/kernel/result.js';
import type { IReviewAttemptsClient, TranslateSubject, WritingTaskSubject } from '../application/ports/review-attempts.client.js';
import type { IEvalRunRepository } from './application/ports/eval-run.repository.js';
import { bindingMatch } from './application/review-eval-runs.queries.js';
import { ReviewEvalRunner } from './application/review-eval-runner.js';
import { RunReviewEvalCommand } from './application/run-review-eval.command.js';
import { RunReviewEvalHandler } from './application/run-review-eval.handler.js';
import { totalCost, type EvalRun, type EvalRunFinish } from './domain/eval-run.js';
import { overlaps, scoreCase, scoreMarks, summarize, type CaseResult } from './domain/eval-score.js';
import type { ReviewCase } from './domain/review-case.js';

// Plan 79, step 1.6.

function reviewCase(over: Partial<ReviewCase> = {}): ReviewCase {
  return {
    caseId: 'a1',
    decidedAt: '2026-10-22T10:00:00.000Z',
    templateCode: 'translate_to_target',
    subject: {
      template: 'translate',
      langs: { explain: 'Russisk', target: 'Norsk' },
      ai: { on: true, checks: { grammar: true, order: true, lexis: true } },
      sentences: [
        { itemId: 's1', direction: 'to_target', source: 'Я живу здесь три года.', refs: ['Jeg har bodd her i tre år'], answer: 'Jeg bor her i tre år' },
        { itemId: 's2', direction: 'to_target', source: 'Она читает книгу.', refs: ['Hun leser en bok'], answer: 'Hun leser boka' },
        { itemId: 's3', direction: 'to_target', source: 'Мы идём домой.', refs: ['Vi går hjem'], answer: 'Vi går hjem' },
      ],
    },
    offered: {
      modelId: 'm-prod',
      promptVersion: 'review_draft@1',
      remarks: [
        { sentenceIndex: 1, itemId: 's1', aspect: 'grammar', fragment: 'bor' },
        { sentenceIndex: 2, itemId: 's2', aspect: 'lexis', fragment: 'boka' },
        { sentenceIndex: 3, itemId: 's3', aspect: 'order', fragment: 'går hjem' },
      ],
    },
    // s1 kept (edited), s2 thrown out, s3 left alone
    outcomes: { remarks: ['edited', 'discarded', 'untouched'], summary: null, draftDiscarded: false },
    decisions: [
      { itemId: 's1', approved: false },
      { itemId: 's2', approved: true },
      { itemId: 's3', approved: true },
    ],
    ...over,
  };
}

const translateSubject = () => reviewCase().subject as TranslateSubject;

describe('scoreCase', () => {
  it('finds the kept error, misses nothing it should not repeat', () => {
    const score = scoreCase(reviewCase(), [{ sentenceIndex: 1, aspect: 'grammar', fragment: 'bor her' }]);
    expect(score).toEqual({
      confirmed: 1,
      confirmedFound: 1,
      confirmedFoundAnyAspect: 1,
      rejected: 1,
      rejectedRepeated: 0,
      sentences: 3,
      sentencesAgreed: 3,
      remarks: [{ sentenceIndex: 1, aspect: 'grammar', verdict: 'confirmed' }],
      marksCompared: 0,
      marksSame: 0,
      marksDeltaSum: 0,
      marksAbsDeltaSum: 0,
      marksMissing: 0,
    });
  });

  it('tells a right spot under the wrong aspect from a hit', () => {
    const score = scoreCase(reviewCase(), [{ sentenceIndex: 1, aspect: 'lexis', fragment: 'bor' }]);
    expect(score.confirmedFound).toBe(0);
    expect(score.confirmedFoundAnyAspect).toBe(1);
    expect(score.remarks[0]!.verdict).toBe('confirmed_other_aspect');
  });

  it('counts a repeat of what the teacher threw out, and the sentence it wrongly flags', () => {
    const score = scoreCase(reviewCase(), [{ sentenceIndex: 2, aspect: 'grammar', fragment: 'boka' }]);
    expect(score.rejectedRepeated).toBe(1);
    expect(score.remarks[0]!.verdict).toBe('rejected');
    // s1 not flagged though not accepted, s2 flagged though accepted, s3 right
    expect(score.sentencesAgreed).toBe(1);
  });

  it('judges nothing by a remark the teacher left alone', () => {
    const score = scoreCase(reviewCase(), [{ sentenceIndex: 3, aspect: 'order', fragment: 'går hjem' }]);
    expect(score.remarks[0]!.verdict).toBe('unjudged');
    expect(score).toMatchObject({ confirmed: 1, rejected: 1, rejectedRepeated: 0 });
  });

  it('does not match the same words in another sentence', () => {
    const c = reviewCase({
      subject: {
        ...translateSubject(),
        sentences: translateSubject().sentences.map((s) => ({ ...s, answer: 'Jeg bor her' })),
      },
    });
    const score = scoreCase(c, [{ sentenceIndex: 3, aspect: 'grammar', fragment: 'bor' }]);
    expect(score.confirmedFoundAnyAspect).toBe(0);
  });

  it('ignores decisions on sentences the set no longer has', () => {
    const c = reviewCase({ decisions: [...reviewCase().decisions, { itemId: 'gone', approved: false }] });
    expect(scoreCase(c, []).sentences).toBe(3);
  });
});

// Plan 79, step 1.7d.
describe('scoreMarks', () => {
  const hint = (criterionId: string, mark: 0 | 1 | 2 | 3) => ({ criterionId, mark, reason: 'r' });

  it('compares each mark the teacher gave with the suggestion on the same criterion', () => {
    expect(scoreMarks({ task: 3, struct: 2, lang: 1 }, [hint('task', 3), hint('struct', 1), hint('lang', 3)])).toEqual({
      marksCompared: 3,
      marksSame: 1,
      marksDeltaSum: -1,
      marksAbsDeltaSum: 3,
      marksMissing: 0,
    });
  });

  it('counts a criterion the candidate did not mark as missing, and skips a mark the teacher did not give', () => {
    expect(scoreMarks({ task: 2, struct: 9 }, null)).toMatchObject({ marksCompared: 0, marksMissing: 1 });
    expect(scoreMarks(null, [hint('task', 2)])).toMatchObject({ marksCompared: 0, marksMissing: 0 });
  });

  it('rides along with the remarks of an essay case', () => {
    const essay = reviewCase({ marks: { task: 2 } });
    expect(scoreCase(essay, [], [hint('task', 1)])).toMatchObject({ marksCompared: 1, marksSame: 0, marksDeltaSum: 1 });
    expect(scoreCase(reviewCase(), [])).toMatchObject({ marksCompared: 0, marksMissing: 0 });
  });
});

describe('overlaps', () => {
  it('places quotes in the answer', () => {
    expect(overlaps('Jeg bor her i tre år', 'bor', 'bor her')).toBe(true);
    expect(overlaps('Jeg bor her i tre år', 'Jeg', 'her')).toBe(false);
  });
  it('matches a quote it cannot place only by identity', () => {
    expect(overlaps('changed', 'bor', 'bor')).toBe(true);
    expect(overlaps('changed', 'bor', 'bor her')).toBe(false);
  });
});

describe('summarize', () => {
  const ok = (score: ReturnType<typeof scoreCase>, latencyMs = 100): CaseResult => ({
    caseId: 'x',
    outcome: 'ok',
    errorCode: null,
    latencyMs,
    score,
  });

  it('rates over answered cases only and counts failures apart', () => {
    const hit = scoreCase(reviewCase(), [{ sentenceIndex: 1, aspect: 'grammar', fragment: 'bor' }]);
    const miss = scoreCase(reviewCase(), [{ sentenceIndex: 2, aspect: 'lexis', fragment: 'boka' }]);
    const scores = summarize([
      ok(hit, 100),
      ok(miss, 300),
      { caseId: 'y', outcome: 'invalid_response', errorCode: 'invalid_response', latencyMs: 200, score: null },
    ]);

    expect(scores).toMatchObject({
      cases: 3,
      ok: 2,
      invalidResponse: 1,
      error: 0,
      confirmedRecall: 0.5,
      confirmedRecallAnyAspect: 0.5,
      rejectedRepeatRate: 0.5,
      sentenceAgreement: 0.667,
      remarkPrecision: 0.5,
      remarksPerCase: 1,
      avgLatencyMs: 200,
    });
  });

  it('leaves a rate it has nothing to count for null rather than zero', () => {
    const scores = summarize([{ caseId: 'y', outcome: 'error', errorCode: 'timeout', latencyMs: 50, score: null }]);
    expect(scores).toMatchObject({ confirmedRecall: null, sentenceAgreement: null, remarkPrecision: null, remarksPerCase: null });
    expect(scores).toMatchObject({ markAgreement: null, markMeanAbsDelta: null, markBias: null });
  });

  // Plan 79, step 1.7d.
  it('rates suggested marks over every compared criterion of the run', () => {
    const hint = (criterionId: string, mark: 0 | 1 | 2 | 3) => ({ criterionId, mark, reason: 'r' });
    const one = scoreCase(reviewCase({ marks: { a: 2, b: 2 } }), [], [hint('a', 2), hint('b', 3)]);
    const two = scoreCase(reviewCase({ marks: { a: 3, b: 1 } }), [], [hint('a', 1), hint('b', 1)]);

    expect(summarize([ok(one), ok(two)])).toMatchObject({
      markAgreement: 0.5,
      markMeanAbsDelta: 0.75,
      markBias: 0.25,
      totals: { marksCompared: 4, marksSame: 2, marksDeltaSum: 1, marksAbsDeltaSum: 3, marksMissing: 0 },
    });
  });
});

describe('totalCost', () => {
  it('sums when every call is priced in one currency', () => {
    expect(
      totalCost([
        { cost: { micros: 10, currency: 'USD' }, credits: '0.001000' },
        { cost: { micros: 15, currency: 'USD' }, credits: '0.002000' },
      ]),
    ).toEqual({ cost: { micros: 25, currency: 'USD' }, credits: '0.003000' });
  });
  it('gives no sum when a call had no price', () => {
    expect(totalCost([{ cost: { micros: 10, currency: 'USD' }, credits: '0.1' }, { cost: null, credits: null }])).toEqual({
      cost: null,
      credits: null,
    });
  });
});

describe('bindingMatch', () => {
  const binding = { primaryModelId: 'p', fallbackModelId: 'f', promptVersion: 'review_draft@1' };
  it('marks the bound model under the bound prompt version only', () => {
    expect(bindingMatch({ modelId: 'p', promptVersion: 'review_draft@1' }, binding)).toBe('primary');
    expect(bindingMatch({ modelId: 'f', promptVersion: 'review_draft@1' }, binding)).toBe('fallback');
    expect(bindingMatch({ modelId: 'p', promptVersion: 'review_draft@2' }, binding)).toBeNull();
    expect(bindingMatch({ modelId: 'p', promptVersion: 'review_draft@1' }, null)).toBeNull();
  });
});

// ── the run ───────────────────────────────────────────────────────────────────

const features: ModelFeatures = {
  structuredOutput: 'json_mode',
  tools: false,
  streaming: false,
  vision: false,
  audioIn: false,
  batch: false,
  promptCache: false,
  contextWindow: 100_000,
  maxOutput: 8_000,
};

const CANDIDATE: ModelForCall = {
  model: { id: 'cand', providerId: 'p', providerCode: 'fake', providerModelId: 'fake', displayName: 'cand', modality: 'llm', features, status: 'active' },
  provider: { id: 'p', code: 'fake', kind: 'fake', displayName: 'Fake', baseUrl: null, apiVersion: null, credentialRef: null, region: 'local', enabled: true },
  currentPrice: null,
};

class MemoryRuns implements IEvalRunRepository {
  readonly created: EvalRun[] = [];
  readonly finished: Array<{ id: string; finish: EvalRunFinish }> = [];
  async create(run: EvalRun) {
    this.created.push(run);
  }
  async finish(id: string, finish: EvalRunFinish) {
    this.finished.push({ id, finish });
    return true;
  }
  async findById() {
    return null;
  }
  async list() {
    return [];
  }
  async failRunning() {
    return 0;
  }
}

type Answer = { remarks: Array<{ sentenceIndex: number; aspect: string; fragment: string }> } | 'invalid' | 'timeout';

function callerAnswering(answers: Answer[], resolved: ModelForCall | 'not_found' | 'not_configured' = CANDIDATE) {
  const calls: Array<{ promptVersion: string; surface: string }> = [];
  const caller = {
    resolve: async () =>
      resolved === 'not_found'
        ? Result.fail({ kind: 'not_found' })
        : resolved === 'not_configured'
          ? Result.fail({ kind: 'not_configured', missing: ['environment variable X is not set'] })
          : Result.ok(resolved),
    call: async (_capability: string, context: { surface: string }, _model: ModelForCall, promptVersion: string): Promise<NamedModelCall> => {
      calls.push({ promptVersion, surface: context.surface });
      const answer = answers[calls.length - 1] ?? { remarks: [] };
      const recorded = { callId: `c${calls.length}`, cost: { micros: 100, currency: 'USD' }, credits: '0.010000' };
      if (answer === 'timeout') return { outcome: { kind: 'error', error: new LlmError('timeout', 'slow', { retryable: true }), raw: null }, recorded, latencyMs: 10 };
      if (answer === 'invalid') {
        return { outcome: { kind: 'error', error: new LlmError('invalid_response', 'bad quote'), raw: null }, recorded, latencyMs: 10 };
      }
      const data = {
        items: answer.remarks.map((r) => ({ ...r, comment: 'c', suggestion: null })),
        summary: null,
      };
      return {
        outcome: {
          kind: 'ok',
          result: {
            output: { kind: 'structured', data },
            stop: 'end',
            usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
            providerRequestId: null,
            latencyMs: 10,
          },
        },
        recorded,
        latencyMs: 10,
      } as NamedModelCall;
    },
  } as unknown as ModelCaller;
  return { caller, calls };
}

const BOUND = { binding: { primaryModelId: 'm-prod', fallbackModelId: null, promptVersion: 'review_draft@1' } };

function setup(opts: {
  answers?: Answer[];
  cases?: ReviewCase[] | 'down';
  skipped?: Record<string, number>;
  resolved?: ModelForCall | 'not_found' | 'not_configured';
  bound?: boolean;
}) {
  const runs = new MemoryRuns();
  const { caller, calls } = callerAnswering(opts.answers ?? [], opts.resolved);
  const runner = new ReviewEvalRunner(caller, runs, 2);
  const started: Array<Promise<void>> = [];
  const spiedRunner = {
    start: (...args: Parameters<ReviewEvalRunner['start']>) => {
      const p = runner.start(...args);
      started.push(p);
      return p;
    },
  } as unknown as ReviewEvalRunner;
  const queryBus = { execute: async () => (opts.bound === false ? { binding: null } : BOUND) } as unknown as QueryBus;
  const limits: number[] = [];
  const attempts = {
    listCases: async (limit: number) => {
      limits.push(limit);
      if (opts.cases === 'down') throw new Error('engine answered 503');
      return { cases: opts.cases ?? [reviewCase()], skipped: opts.skipped ?? {} };
    },
  } as unknown as IReviewAttemptsClient;
  const handler = new RunReviewEvalHandler(caller, spiedRunner, queryBus, attempts, runs);
  return { handler, runs, calls, started, limits };
}

const command = (over: Partial<{ modelId: string; promptVersion: string | null; limit: number }> = {}) =>
  new RunReviewEvalCommand(over.modelId ?? 'cand', over.promptVersion === undefined ? null : over.promptVersion, over.limit ?? 50, 'admin-1');

describe('RunReviewEvalHandler + ReviewEvalRunner', () => {
  it('starts a run on the set, then scores it, cost and all', async () => {
    const second = reviewCase({ caseId: 'a2' });
    const { handler, runs, calls, started, limits } = setup({
      cases: [reviewCase(), second],
      skipped: { NO_DECISIONS: 1 },
      answers: [{ remarks: [{ sentenceIndex: 1, aspect: 'grammar', fragment: 'bor' }] }, 'invalid'],
    });

    const run = await handler.execute(command());
    expect(run).toMatchObject({
      status: 'running',
      modelId: 'cand',
      promptVersion: 'review_draft@1',
      caseCount: 2,
      skipped: { NO_DECISIONS: 1 },
      bindingAtStart: BOUND.binding,
      startedBy: 'admin-1',
    });
    expect(limits).toEqual([50]);
    expect(runs.created).toHaveLength(1);

    await Promise.all(started);
    expect(calls).toEqual([
      { promptVersion: 'review_draft@1', surface: 'admin_eval' },
      { promptVersion: 'review_draft@1', surface: 'admin_eval' },
    ]);
    const [finished] = runs.finished;
    expect(finished!.id).toBe(run.id);
    expect(finished!.finish).toMatchObject({
      status: 'done',
      cost: { micros: 200, currency: 'USD' },
      credits: '0.020000',
      scores: { cases: 2, ok: 1, invalidResponse: 1, confirmedRecall: 1, rejectedRepeatRate: 0, sentenceAgreement: 1 },
    });
    const done = finished!.finish as Extract<EvalRunFinish, { status: 'done' }>;
    expect(done.cases.map((c) => [c.caseId, c.outcome])).toEqual([
      ['a1', 'ok'],
      ['a2', 'invalid_response'],
    ]);
    // Counts only: nothing the model wrote is kept.
    expect(JSON.stringify(done)).not.toContain('"comment"');
  });

  it('runs the prompt version it is given rather than the binding’s', async () => {
    const { handler, calls, started } = setup({});
    const run = await handler.execute(command({ promptVersion: 'review_draft@1' }));
    await Promise.all(started);
    expect(run.promptVersion).toBe('review_draft@1');
    expect(calls[0]!.promptVersion).toBe('review_draft@1');
  });

  it('counts a provider failure as an error case, not a failed run', async () => {
    const { handler, runs, started } = setup({ answers: ['timeout'] });
    await handler.execute(command());
    await Promise.all(started);
    expect(runs.finished[0]!.finish).toMatchObject({ status: 'done', scores: { error: 1, ok: 0, confirmedRecall: null } });
  });

  it('leaves out what the queue would never ask, and says so', async () => {
    const silent = reviewCase({ caseId: 'off', subject: { ...reviewCase().subject, ai: { on: true, checks: {} } } });
    const blank = reviewCase({
      caseId: 'blank',
      subject: { ...translateSubject(), sentences: translateSubject().sentences.map((s) => ({ ...s, answer: ' ' })) },
    });
    const { handler } = setup({ cases: [silent, blank, reviewCase()] });
    const run = await handler.execute(command());
    expect(run).toMatchObject({ caseCount: 1, skipped: { NO_CHECKS: 1, EMPTY_ANSWER: 1 } });
  });

  it('refuses an unknown prompt version before spending anything', async () => {
    const { handler, runs } = setup({});
    await expect(handler.execute(command({ promptVersion: 'review_draft@9' }))).rejects.toThrow(UnprocessableEntityException);
    expect(runs.created).toHaveLength(0);
  });

  it('wants a prompt version when nothing is bound', async () => {
    const { handler } = setup({ bound: false });
    await expect(handler.execute(command())).rejects.toThrow('name a promptVersion');
  });

  it('refuses an unknown or unconfigured model', async () => {
    await expect(setup({ resolved: 'not_found' }).handler.execute(command())).rejects.toThrow(NotFoundException);
    await expect(setup({ resolved: 'not_configured' }).handler.execute(command())).rejects.toThrow(UnprocessableEntityException);
  });

  it('refuses a model without structured output', async () => {
    const plain: ModelForCall = { ...CANDIDATE, model: { ...CANDIDATE.model, modality: 'llm', features: { ...features, structuredOutput: 'none' } } };
    await expect(setup({ resolved: plain }).handler.execute(command())).rejects.toThrow('lacks what review_draft needs');
  });

  it('refuses an empty set, and an unreadable one', async () => {
    await expect(setup({ cases: [] }).handler.execute(command())).rejects.toThrow('No settled drafts');
    await expect(setup({ cases: 'down' }).handler.execute(command())).rejects.toThrow(ServiceUnavailableException);
  });
});

// Plan 79, step 1.7b.
describe('scoreCase on an essay', () => {
  const essay: WritingTaskSubject = {
    template: 'writing_task',
    targetLanguage: 'nb',
    mode: 'letter',
    instruction: '',
    prompt: 'Du flytter.',
    source: '',
    letter: { register: 'informal', recipient: 'Kari' },
    imageCaption: '',
    points: [{ text: 'Når', required: true, keywords: ['i mai'], phrased: false, ticked: false }],
    example: '',
    length: { words: 6, paragraphs: 1, minWords: 0, maxWords: 0 },
    ai: { on: true, checks: { grammar: true, task: true, structure: true, lexis: true } },
    text: 'Hei Kari! Jeg flytte til Bergen.',
  };
  const essayCase = (): ReviewCase =>
    reviewCase({
      templateCode: 'writing_task',
      subject: essay,
      offered: {
        modelId: 'm-prod',
        promptVersion: 'review_draft@1',
        remarks: [
          { sentenceIndex: 1, itemId: 'text', aspect: 'grammar', fragment: 'flytte' },
          { sentenceIndex: 1, itemId: 'text', aspect: 'task', fragment: null },
          { sentenceIndex: 1, itemId: 'text', aspect: 'structure', fragment: null },
        ],
      },
      // grammar and task kept, structure thrown out
      outcomes: { remarks: ['accepted', 'edited', 'discarded'], summary: null, draftDiscarded: false },
      decisions: [],
    });

  it('matches quoted remarks by place and whole-text remarks by aspect alone', () => {
    const score = scoreCase(essayCase(), [
      { sentenceIndex: 1, aspect: 'grammar', fragment: 'Jeg flytte' },
      { sentenceIndex: 1, aspect: 'task', fragment: null },
      { sentenceIndex: 1, aspect: 'structure', fragment: null },
      // About a place, where the teacher's remark was about the whole: not the same spot.
      { sentenceIndex: 1, aspect: 'task', fragment: 'Bergen' },
    ]);
    expect(score.remarks.map((r) => r.verdict)).toEqual(['confirmed', 'confirmed', 'rejected', 'unjudged']);
    expect(score).toMatchObject({
      confirmed: 2,
      confirmedFound: 2,
      rejected: 1,
      rejectedRepeated: 1,
      // A rubric-marked essay has no sentence verdicts to agree with.
      sentences: 0,
      sentencesAgreed: 0,
    });
  });

  it('does not take a whole-text remark under another aspect for the kept one', () => {
    const score = scoreCase(essayCase(), [{ sentenceIndex: 1, aspect: 'structure', fragment: null }]);
    expect(score).toMatchObject({ confirmedFoundAnyAspect: 0, rejectedRepeated: 1 });
  });
});
