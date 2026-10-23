import type { AiGateway, GatewayCall } from '../../../../gateway/application/ai-gateway.js';
import type { GatewayInput } from '../../../../gateway/application/model-router.js';
import type { CallContext } from '../../../../ledger/domain/ai-call.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { commentLanguage } from '../../domain/comment-language.js';
import type {
  DraftToWrite,
  DraftWriteMeta,
  IReviewAttemptsClient,
  ReviewSubjectResult,
  TranslateSubject,
} from '../ports/review-attempts.client.js';
import type { ISchoolLanguageReader } from '../ports/school-language.reader.js';
import { SchoolPayerResolver } from '../school-payer.resolver.js';
import { DraftReviewCommand } from './draft-review.command.js';
import { DraftReviewHandler, REVIEW_QUEUE_SURFACE } from './draft-review.handler.js';

// Plan 79, step 1.3.

const ATTEMPT = 'a0000000-0000-4000-8000-000000000001';
const SCHOOL = 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8';

const subjectResult = (over: Partial<ReviewSubjectResult> = {}, ai = { on: true, checks: { grammar: true, order: false, lexis: true } }): ReviewSubjectResult => ({
  attemptId: ATTEMPT,
  userId: 'learner-1',
  schoolId: SCHOOL,
  templateCode: 'translate_to_target',
  skip: null,
  subject: {
    template: 'translate',
    langs: { explain: 'Russisk', target: 'Norsk' },
    ai,
    sentences: [
      { itemId: 's1', direction: 'to_target', source: 'Я живу здесь три года.', refs: ['Jeg har bodd her i tre år'], answer: 'Jeg bor her i tre år' },
      { itemId: 's2', direction: 'from_target', source: 'Hun leser.', refs: ['Она читает'], answer: '' },
    ],
  },
  ...over,
});

const MODEL = {
  model: { id: 'model-1', providerId: 'provider-1', providerModelId: 'fake-1' },
  provider: { code: 'fake' },
};
const BINDING = { promptVersion: 'review_draft@1' };
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

const refused = (code: string): GatewayCall =>
  ({ routed: Result.fail({ kind: 'refused', code, binding: BINDING, attempts: [] }), recorded, latencyMs: 1 }) as unknown as GatewayCall;

interface Setup {
  subject?: ReviewSubjectResult | null;
  call?: GatewayCall;
  language?: string | null | 'throws';
  put?: Array<'ok' | 'throws' | { code: string }>;
}

function setup({ subject = subjectResult(), call = answered({ items: [], summary: null }), language = null, put = ['ok'] }: Setup = {}) {
  const calls: Array<{ capability: string; context: CallContext; request: ReturnType<Extract<GatewayInput, Function>> }> = [];
  const gateway = {
    call: async (capability: string, context: CallContext, input: GatewayInput) => {
      calls.push({ capability, context, request: typeof input === 'function' ? input('review_draft@1') : input });
      return call;
    },
  } as unknown as AiGateway;

  const writes: Array<{ draft: DraftToWrite; meta: DraftWriteMeta }> = [];
  const puts = [...put];
  let reads = 0;
  const attempts: IReviewAttemptsClient = {
    getSubject: async () => {
      reads++;
      return subject;
    },
    putDraft: async (_id, draft, meta) => {
      const next = puts.shift() ?? 'ok';
      if (next === 'throws') throw new Error('engine down');
      writes.push({ draft, meta });
      return next === 'ok' ? { written: true } : { written: false, code: next.code };
    },
    listCases: async () => ({ cases: [], skipped: {} }),
  };
  const schools: ISchoolLanguageReader = {
    explanationLanguage: async () => {
      if (language === 'throws') throw new Error('org down');
      return language;
    },
  };
  const handler = new DraftReviewHandler(gateway, new SchoolPayerResolver(), attempts, schools, 0);
  return { handler, calls, writes, reads: () => reads };
}

const command = (over: Partial<{ templateCode: string; schoolId: string | null }> = {}) =>
  new DraftReviewCommand(ATTEMPT, 'learner-1', over.templateCode ?? 'translate_to_target', over.schoolId === undefined ? SCHOOL : over.schoolId);

describe('DraftReviewHandler', () => {
  it('drafts a school submission under the school as payer, on the review_queue surface', async () => {
    const remark = { sentenceIndex: 1, aspect: 'grammar', fragment: 'bor', comment: ' Нужен perfektum. ', suggestion: 'har bodd' };
    const { handler, calls, writes } = setup({ call: answered({ items: [remark], summary: ' ' }), language: 'ru' });

    const outcome = await handler.execute(command());

    expect(outcome).toEqual({ kind: 'written', status: 'ready', remarks: 1, aiCallId: 'call-1' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.capability).toBe('review_draft');
    expect(calls[0]!.context).toEqual({
      payer: { type: 'workspace', id: SCHOOL },
      actor: { userId: 'learner-1', role: null },
      surface: REVIEW_QUEUE_SURFACE,
    });
    // Only the enabled checks, and remarks in the school's language spelled out.
    const system = calls[0]!.request.system!;
    expect(system).toContain('in Russian');
    expect(system).toContain('grammar —');
    expect(system).not.toContain('order —');
    expect(writes).toEqual([
      {
        draft: {
          status: 'ready',
          items: [{ itemId: 's1', sentenceIndex: 1, aspect: 'grammar', fragment: 'bor', comment: 'Нужен perfektum.', suggestion: 'har bodd' }],
          summary: null,
        },
        meta: { aiCallId: 'call-1', providerId: 'provider-1', modelId: 'model-1', promptVersion: 'review_draft@1' },
      },
    ]);
  });

  it.each([
    [{ templateCode: 'short_answer' }, 'template_not_in_first_wave'],
    [{ schoolId: null }, 'no_school'],
  ])('skips %o from the event alone, reading nothing', async (over, reason) => {
    const { handler, reads, calls } = setup();
    expect(await handler.execute(command(over))).toEqual({ kind: 'skipped', reason });
    expect(reads()).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it.each<[string, Setup['subject'], string]>([
    ['unknown attempt', null, 'attempt_not_found'],
    ['a draft already there', subjectResult({ skip: 'DRAFT_EXISTS', subject: null }), 'draft_exists'],
    ['a decided submission', subjectResult({ skip: 'ATTEMPT_NOT_IN_REVIEW', subject: null }), 'attempt_not_in_review'],
    ['AI switched off by the author', subjectResult({}, { on: false, checks: { grammar: true, order: true, lexis: true } }), 'ai_off'],
    ['every check off', subjectResult({}, { on: true, checks: { grammar: false, order: false, lexis: false } }), 'no_checks'],
  ])('skips %s without calling a model', async (_label, subject, reason) => {
    const { handler, calls, writes } = setup({ subject });
    expect(await handler.execute(command())).toEqual({ kind: 'skipped', reason });
    expect(calls).toHaveLength(0);
    expect(writes).toHaveLength(0);
  });

  it('skips a submission with every answer blank', async () => {
    const blank = subjectResult();
    const subject = blank.subject as TranslateSubject;
    subject.sentences = subject.sentences.map((s) => ({ ...s, answer: '  ' }));
    const { handler, calls } = setup({ subject: blank });
    expect(await handler.execute(command())).toEqual({ kind: 'skipped', reason: 'empty_answer' });
    expect(calls).toHaveLength(0);
  });

  it('writes nothing when the gate refuses: no model was asked, the ledger says why', async () => {
    const { handler, writes } = setup({ call: refused('not_entitled') });
    expect(await handler.execute(command())).toEqual({
      kind: 'not_called',
      outcome: 'refused_quota',
      errorCode: 'not_entitled',
      aiCallId: 'call-1',
    });
    expect(writes).toHaveLength(0);
  });

  it('writes a failed draft without text when the model answered off-schema', async () => {
    const { handler, writes } = setup({ call: failedWith('invalid_response') });
    expect(await handler.execute(command())).toEqual({ kind: 'written', status: 'failed', remarks: 0, aiCallId: 'call-1' });
    expect(writes[0]!.draft).toEqual({ status: 'failed', errorCode: 'invalid_response' });
    expect(writes[0]!.meta.modelId).toBe('model-1');
  });

  it('falls back to the exercise label when the school language is unset or unreadable', async () => {
    for (const language of [null, 'throws'] as const) {
      const { handler, calls } = setup({ language });
      await handler.execute(command());
      expect(calls[0]!.request.system).toContain('in Russisk');
    }
  });

  it('retries a failed write itself rather than asking the model again', async () => {
    const { handler, calls, writes } = setup({ put: ['throws', 'ok'] });
    expect((await handler.execute(command())).kind).toBe('written');
    expect(calls).toHaveLength(1);
    expect(writes).toHaveLength(1);

    const lost = setup({ put: ['throws', 'throws'] });
    expect(await lost.handler.execute(command())).toEqual({ kind: 'write_failed', aiCallId: 'call-1' });
    expect(lost.calls).toHaveLength(1);
  });

  it('reports the engine turning the draft down — a teacher decided meanwhile', async () => {
    const { handler } = setup({ put: [{ code: 'ATTEMPT_NOT_IN_REVIEW' }] });
    expect(await handler.execute(command())).toEqual({ kind: 'refused_by_engine', code: 'ATTEMPT_NOT_IN_REVIEW', aiCallId: 'call-1' });
  });
});

describe('commentLanguage', () => {
  it('spells a code out in English, keeps free text, falls back to the exercise label', () => {
    expect(commentLanguage('ru', 'Russisk')).toBe('Russian');
    expect(commentLanguage('uk', 'Russisk')).toBe('Ukrainian');
    expect(commentLanguage(null, 'Russisk')).toBe('Russisk');
    expect(commentLanguage('not a tag!', 'Russisk')).toBe('not a tag!');
  });
});
