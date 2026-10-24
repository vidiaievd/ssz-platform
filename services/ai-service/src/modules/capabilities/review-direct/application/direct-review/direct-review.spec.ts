import type { AiGateway, GatewayCall } from '../../../../gateway/application/ai-gateway.js';
import type { GatewayInput } from '../../../../gateway/application/model-router.js';
import type { CallContext } from '../../../../ledger/domain/ai-call.js';
import { Result } from '../../../../../shared/kernel/result.js';
import type {
  DraftWriteMeta,
  ReviewSubjectResult,
  TranslateSubject,
} from '../../../review-draft/application/ports/review-attempts.client.js';
import { LearnerPayerResolver } from '../learner-payer.resolver.js';
import type {
  GiveUpReason,
  IDirectReviewAttemptsClient,
  ReviewToWrite,
} from '../ports/direct-review-attempts.client.js';
import type { ILearnerLanguageReader } from '../ports/learner-language.reader.js';
import { DirectReviewCommand } from './direct-review.command.js';
import { DirectReviewHandler, SELF_STUDY_SURFACE } from './direct-review.handler.js';

// Plan 79, step 2.2c.

const ATTEMPT = 'a0000000-0000-4000-8000-000000000002';
const LEARNER = 'c8655ecd-0000-4000-8000-000000000001';

const subjectResult = (over: Partial<ReviewSubjectResult> = {}, ai = { on: true, checks: { grammar: true, order: false, lexis: true } }): ReviewSubjectResult => ({
  attemptId: ATTEMPT,
  userId: LEARNER,
  schoolId: null,
  templateCode: 'translate_to_target',
  skip: null,
  subject: {
    template: 'translate',
    langs: { explain: 'Russisk', target: 'Norsk' },
    ai,
    sentences: [
      { itemId: 's1', direction: 'to_target', source: 'Я живу здесь три года.', refs: ['Jeg har bodd her i tre år'], answer: 'Jeg bor her i tre år' },
      { itemId: 's2', direction: 'to_target', source: 'Она читает.', refs: ['Hun leser'], answer: 'Hun leser' },
    ],
  },
  ...over,
});

const MODEL = {
  model: { id: 'model-1', providerId: 'provider-1', providerModelId: 'fake-1' },
  provider: { code: 'fake' },
};
const BINDING = { promptVersion: 'review_direct@1' };
const recorded = { callId: 'call-1', cost: null, credits: '0' };

const answered = (data: unknown): GatewayCall =>
  ({
    routed: Result.ok({
      result: { output: { kind: 'structured', data }, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } },
      model: MODEL,
      role: 'primary',
      binding: BINDING,
      attempts: [],
    }),
    recorded,
    latencyMs: 5,
  }) as unknown as GatewayCall;

const failedWith = (code: string): GatewayCall =>
  ({
    routed: Result.fail({ kind: 'error', error: { code, message: code }, model: MODEL, role: 'primary', binding: BINDING, raw: null, attempts: [] }),
    recorded,
    latencyMs: 5,
  }) as unknown as GatewayCall;

const notRouted = (failure: Record<string, unknown>): GatewayCall =>
  ({ routed: Result.fail({ binding: BINDING, attempts: [], ...failure }), recorded, latencyMs: 1 }) as unknown as GatewayCall;

const RETURNED = {
  items: [{ sentenceIndex: 1, aspect: 'grammar', fragment: 'bor', comment: ' Here you need the perfect. ', suggestion: 'har bodd' }],
  decisions: { sentence_1: false, sentence_2: true },
  outcome: 'returned',
  summary: ' One tense to fix. ',
};

type Answer<T> = T | 'throws' | { code: string };

interface Setup {
  subject?: ReviewSubjectResult | null;
  call?: GatewayCall;
  language?: string | null | 'throws';
  put?: Array<Answer<'ok'>>;
  giveUp?: Array<Answer<'ok'>>;
}

function setup({ subject = subjectResult(), call = answered(RETURNED), language = 'en', put = ['ok'], giveUp = ['ok'] }: Setup = {}) {
  const calls: Array<{ capability: string; context: CallContext; request: ReturnType<Extract<GatewayInput, Function>> }> = [];
  const gateway = {
    call: async (capability: string, context: CallContext, input: GatewayInput) => {
      calls.push({ capability, context, request: typeof input === 'function' ? input('review_direct@1') : input });
      return call;
    },
  } as unknown as AiGateway;

  const writes: Array<{ review: ReviewToWrite; meta: DraftWriteMeta }> = [];
  const gaveUp: Array<{ reason: GiveUpReason; aiCallId: string | null }> = [];
  const puts = [...put];
  const giveUps = [...giveUp];
  const attempts: IDirectReviewAttemptsClient = {
    getSubject: async () => subject,
    putReview: async (_id, review, meta) => {
      const next = puts.shift() ?? 'ok';
      if (next === 'throws') throw new Error('engine down');
      writes.push({ review, meta });
      return next === 'ok' ? { written: true, attemptStatus: 'returned' } : { written: false, code: next.code };
    },
    giveUp: async (_id, reason, aiCallId) => {
      const next = giveUps.shift() ?? 'ok';
      if (next === 'throws') throw new Error('engine down');
      gaveUp.push({ reason, aiCallId });
      return next === 'ok' ? { closed: true } : { closed: false, code: next.code };
    },
  };
  const learners: ILearnerLanguageReader = {
    interfaceLanguage: async () => {
      if (language === 'throws') throw new Error('profiles down');
      return language;
    },
  };
  const handler = new DirectReviewHandler(gateway, new LearnerPayerResolver(), attempts, learners, 0);
  return { handler, calls, writes, gaveUp };
}

const command = () => new DirectReviewCommand(ATTEMPT, LEARNER, 'translate_to_target');

describe('DirectReviewHandler', () => {
  it("reviews the learner's work under the learner as payer, on the self_study surface, and writes the verdict", async () => {
    const { handler, calls, writes, gaveUp } = setup();

    expect(await handler.execute(command())).toEqual({ kind: 'ruled', attemptStatus: 'returned', remarks: 1, aiCallId: 'call-1' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.capability).toBe('review_direct');
    expect(calls[0]!.context).toEqual({
      payer: { type: 'user', id: LEARNER },
      actor: { userId: LEARNER, role: null },
      surface: SELF_STUDY_SURFACE,
    });
    // Remarks in the learner's interface language, spelled out.
    expect(calls[0]!.request.system).toContain('English');
    expect(writes).toEqual([
      {
        review: {
          status: 'ready',
          items: [{ itemId: 's1', sentenceIndex: 1, aspect: 'grammar', fragment: 'bor', comment: 'Here you need the perfect.', suggestion: 'har bodd' }],
          summary: 'One tense to fix.',
          marks: null,
          verdict: {
            outcome: 'returned',
            decisions: [
              { itemId: 's1', approved: false },
              { itemId: 's2', approved: true },
            ],
          },
        },
        meta: { aiCallId: 'call-1', providerId: 'provider-1', modelId: 'model-1', promptVersion: 'review_direct@1' },
      },
    ]);
    expect(gaveUp).toHaveLength(0);
  });

  it.each<[string, ReviewSubjectResult | null, string]>([
    ['unknown attempt', null, 'attempt_not_found'],
    ['a decided submission', subjectResult({ skip: 'ATTEMPT_NOT_IN_REVIEW', subject: null }), 'attempt_not_in_review'],
    ['a school submission', subjectResult({ skip: 'HAS_TEACHER_REVIEW', subject: null }), 'has_teacher_review'],
    ['a school on the row the event did not carry', subjectResult({ schoolId: 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8' }), 'has_school'],
  ])('skips %s: somebody else decides it, nothing is closed', async (_label, subject, reason) => {
    const { handler, calls, gaveUp } = setup({ subject });
    expect(await handler.execute(command())).toEqual({ kind: 'skipped', reason });
    expect(calls).toHaveLength(0);
    expect(gaveUp).toHaveLength(0);
  });

  it.each<[string, ReviewSubjectResult, string]>([
    ['a template without a prompt', subjectResult({ skip: 'TEMPLATE_NOT_SUPPORTED', subject: null }), 'template_not_supported'],
    ['an exercise gone from content', subjectResult({ skip: 'EXERCISE_GONE', subject: null }), 'exercise_gone'],
    ['AI switched off by the author', subjectResult({}, { on: false, checks: { grammar: true, order: true, lexis: true } }), 'ai_off'],
    ['every check off', subjectResult({}, { on: true, checks: { grammar: false, order: false, lexis: false } }), 'no_checks'],
  ])('closes %s as unaskable, asking no model', async (_label, subject, cause) => {
    const { handler, calls, gaveUp } = setup({ subject });
    expect(await handler.execute(command())).toEqual({ kind: 'gave_up', reason: 'unaskable', cause, aiCallId: null, engine: 'closed' });
    expect(calls).toHaveLength(0);
    expect(gaveUp).toEqual([{ reason: 'unaskable', aiCallId: null }]);
  });

  it('closes a submission with every answer blank as unaskable', async () => {
    const blank = subjectResult();
    (blank.subject as TranslateSubject).sentences.forEach((s) => (s.answer = ' '));
    const { handler, calls, gaveUp } = setup({ subject: blank });
    expect(await handler.execute(command())).toMatchObject({ kind: 'gave_up', reason: 'unaskable', cause: 'empty_answer' });
    expect(calls).toHaveLength(0);
    expect(gaveUp).toHaveLength(1);
  });

  it('finishes a run cut off after a failed review: the stored review is closed as failed', async () => {
    const { handler, calls, gaveUp } = setup({ subject: subjectResult({ skip: 'DRAFT_EXISTS', subject: null }) });
    expect(await handler.execute(command())).toEqual({ kind: 'gave_up', reason: 'failed', cause: 'draft_exists', aiCallId: null, engine: 'closed' });
    expect(calls).toHaveLength(0);
    expect(gaveUp).toEqual([{ reason: 'failed', aiCallId: null }]);
  });

  it('reports the refusal when the engine keeps a ready review it will not close', async () => {
    const { handler } = setup({ subject: subjectResult({ skip: 'DRAFT_EXISTS', subject: null }), giveUp: [{ code: 'REVIEW_EXISTS' }] });
    expect(await handler.execute(command())).toMatchObject({ kind: 'gave_up', engine: 'REVIEW_EXISTS' });
  });

  it.each<[string, GatewayCall, GiveUpReason, string]>([
    ['the key off for the learner', notRouted({ kind: 'refused', code: 'not_entitled' }), 'refused', 'not_entitled'],
    ['the AI switched off by policy', notRouted({ kind: 'refused', code: 'ai_disabled' }), 'refused', 'ai_disabled'],
    ['the capability not bound', notRouted({ kind: 'disabled', binding: null }), 'refused', 'disabled'],
    ['every model skipped', notRouted({ kind: 'unavailable' }), 'failed', 'unavailable'],
    ['the tariff unreadable', notRouted({ kind: 'gate_unavailable' }), 'failed', 'gate_unavailable'],
  ])('closes the attempt when no model was asked — %s', async (_label, call, reason, cause) => {
    const { handler, writes, gaveUp } = setup({ call });
    expect(await handler.execute(command())).toEqual({ kind: 'gave_up', reason, cause, aiCallId: 'call-1', engine: 'closed' });
    expect(writes).toHaveLength(0);
    expect(gaveUp).toEqual([{ reason, aiCallId: 'call-1' }]);
  });

  it('records a failed review without text, then closes the attempt as failed', async () => {
    const { handler, writes, gaveUp } = setup({ call: failedWith('invalid_response') });
    expect(await handler.execute(command())).toEqual({
      kind: 'gave_up',
      reason: 'failed',
      cause: 'invalid_response',
      aiCallId: 'call-1',
      engine: 'closed',
    });
    expect(writes.map((w) => w.review)).toEqual([{ status: 'failed', errorCode: 'invalid_response' }]);
    expect(writes[0]!.meta.modelId).toBe('model-1');
    expect(gaveUp).toEqual([{ reason: 'failed', aiCallId: 'call-1' }]);
  });

  it('closes the attempt when the engine turns the verdict down', async () => {
    const { handler, gaveUp } = setup({ put: [{ code: 'VERDICT_INCOMPLETE' }] });
    expect(await handler.execute(command())).toMatchObject({ kind: 'gave_up', reason: 'failed', cause: 'engine_verdict_incomplete' });
    expect(gaveUp).toHaveLength(1);
  });

  it('retries a write that did not reach the engine once, without asking the model again', async () => {
    const { handler, calls, writes } = setup({ put: ['throws', 'ok'] });
    expect(await handler.execute(command())).toMatchObject({ kind: 'ruled' });
    expect(calls).toHaveLength(1);
    expect(writes).toHaveLength(1);
  });

  it('tries to close the attempt when the review is lost on both writes, and says so when that is lost too', async () => {
    const { handler, calls } = setup({ put: ['throws', 'throws'], giveUp: ['throws', 'throws'] });
    expect(await handler.execute(command())).toEqual({
      kind: 'gave_up',
      reason: 'failed',
      cause: 'review_write_lost',
      aiCallId: 'call-1',
      engine: 'lost',
    });
    expect(calls).toHaveLength(1);
  });

  it("falls back to the exercise's label when the learner's language is unknown or unreadable", async () => {
    for (const language of [null, 'throws'] as const) {
      const { handler, calls } = setup({ language });
      await handler.execute(command());
      expect(calls[0]!.request.system).toContain('Russisk');
    }
  });
});
