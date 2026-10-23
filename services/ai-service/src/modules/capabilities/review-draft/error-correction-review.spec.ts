import type { AiGateway, GatewayCall } from '../../gateway/application/ai-gateway.js';
import type { GatewayInput } from '../../gateway/application/model-router.js';
import { SchemaGuard } from '../../providers/application/schema-guard.js';
import type { LlmRequest } from '../../providers/domain/llm-request.js';
import type { LlmResult } from '../../providers/domain/llm-result.js';
import { Result } from '../../../shared/kernel/result.js';
import { DraftReviewCommand } from './application/draft-review/draft-review.command.js';
import { DraftReviewHandler } from './application/draft-review/draft-review.handler.js';
import type { ErrorCorrectionSubject, IReviewAttemptsClient, ReviewSubjectResult } from './application/ports/review-attempts.client.js';
import { toReviewSubject, unaskable } from './application/review-input.js';
import { SchoolPayerResolver } from './application/school-payer.resolver.js';
import { errorCorrectionAspects } from './domain/review-aspect.js';
import { toReviewDraft } from './domain/review-remarks.js';
import { scoreCase } from './eval/domain/eval-score.js';
import type { ReviewCase } from './eval/domain/review-case.js';
import { reviewRequest } from './prompts/prompts.js';

// Plan 79, step 1.7: error_correction.

const subject = (checks = { explainWhy: true, altFixes: true, register: false }): ErrorCorrectionSubject => ({
  template: 'error_correction',
  targetLanguage: 'nb',
  note: 'Fortid.',
  ai: { on: true, checks },
  sentences: [
    {
      itemId: 'e1',
      given: 'Jeg går på kino i går',
      refs: ['Jeg gikk på kino i går'],
      answer: 'Jeg dro på kino i går',
      matchesKey: false,
      mistakes: [{ wrong: 'går', fix: 'gikk', type: 'form', state: 'attempted', submitted: 'dro' }],
      stray: [],
      teacherNote: 'Preteritum.',
    },
    {
      itemId: 'e2',
      given: 'Han bo i Oslo',
      refs: ['Han bor i Oslo'],
      answer: 'Han bo i Oslo',
      matchesKey: false,
      mistakes: [{ wrong: 'bo', fix: 'bor', type: 'form', state: 'missed', submitted: 'bo', note: 'Presens av «bo».' }],
      stray: [],
    },
    { itemId: 'e3', given: 'Vi spiser', refs: ['Vi spiser'], answer: 'Vi spiser', matchesKey: true, mistakes: [], stray: [] },
  ],
});

const prepared = toReviewSubject(subject(), null);
const input = prepared.template === 'error_correction' ? prepared.input : (null as never);

const request = (): LlmRequest => ({ ...reviewRequest('review_draft@1', prepared), maxOutputTokens: 2_000, timeoutMs: 10_000 });

const answered = (data: unknown): LlmResult => ({
  output: { kind: 'structured', data },
  stop: 'end',
  usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
  providerRequestId: null,
  latencyMs: 1,
});

const remark = (over: Record<string, unknown> = {}) => ({
  sentenceIndex: 2,
  aspect: 'grammar',
  fragment: 'bo',
  comment: 'Presens: bor.',
  suggestion: 'bor',
  ...over,
});

describe('review_draft — error_correction, prompt v1', () => {
  const guard = new SchemaGuard();
  const check = (data: unknown) => guard.check(answered(data), request());

  it('reads the template switches as aspects: explainWhy → the three error aspects, altFixes → alternative', () => {
    expect(errorCorrectionAspects({ explainWhy: true, altFixes: true, register: false })).toEqual(['grammar', 'order', 'lexis', 'alternative']);
    expect(errorCorrectionAspects({ explainWhy: false, altFixes: false, register: true })).toEqual(['register']);
    expect(errorCorrectionAspects({})).toEqual([]);
  });

  it('spells the learnt language out and, without a school language, writes remarks in it', () => {
    expect(input.targetLanguage).toBe('Norwegian Bokmål');
    expect(input.commentLanguage).toBe('Norwegian Bokmål');
    const withSchool = toReviewSubject(subject(), 'ru');
    expect(withSchool.template === 'error_correction' && withSchool.input.commentLanguage).toBe('Russian');
  });

  it('accepts an error on a missed mistake and an alternative on an unforeseen repair', () => {
    const outcome = check({
      items: [remark(), remark({ sentenceIndex: 1, aspect: 'alternative', fragment: 'dro', comment: '«Dro» passer også.', suggestion: null })],
      summary: null,
    });
    expect(outcome.isOk).toBe(true);
    expect(toReviewDraft((outcome.value.output as { data: unknown }).data, input).items.map((r) => [r.itemId, r.aspect])).toEqual([
      ['e2', 'grammar'],
      ['e1', 'alternative'],
    ]);
  });

  it('refuses a quotation from the given sentence that the learner repaired away', () => {
    const outcome = check({ items: [remark({ sentenceIndex: 1, fragment: 'går på' })], summary: null });
    expect(outcome.isFail).toBe(true);
    expect(outcome.error.message).toContain('"går på" does not occur in the answer to sentence 1');
  });

  it('refuses an aspect the author switched off', () => {
    expect(check({ items: [remark({ aspect: 'register' })], summary: null }).isFail).toBe(true);
    const noAlternatives = toReviewSubject(subject({ explainWhy: true, altFixes: false, register: false }), null);
    const guarded = guard.check(
      answered({ items: [remark({ sentenceIndex: 1, aspect: 'alternative', fragment: 'dro', suggestion: null })], summary: null }),
      { ...reviewRequest('review_draft@1', noAlternatives), maxOutputTokens: 2_000, timeoutMs: 10_000 },
    );
    expect(guarded.isFail).toBe(true);
  });

  describe('prompt', () => {
    const { system, messages, responseSchema } = request();
    const user = JSON.parse((messages[0]!.parts[0] as { text: string }).text);

    it('asks for the enabled aspects, alternatives included', () => {
      expect(system).toContain('grammar —');
      expect(system).toContain('alternative —');
      expect(system).not.toContain('register —');
      expect(responseSchema!.name).toBe('error_correction_review');
    });

    it('without altFixes, tells the model not to flag a different repair as an error', () => {
      const off = reviewRequest('review_draft@1', toReviewSubject(subject({ explainWhy: true, altFixes: false, register: false }), null));
      expect(off.system).not.toContain('alternative —');
      expect(off.system).toContain('differs from the key but may be right is not reported');
    });

    it('sends what the checker found per mistake, the submitted words only where they differ', () => {
      expect(user.context).toBe('Fortid.');
      expect(user.sentences.map((s: { number: number }) => s.number)).toEqual([1, 2, 3]);
      expect(user.sentences[0]).toEqual({
        number: 1,
        given: 'Jeg går på kino i går',
        acceptedSentences: ['Jeg gikk på kino i går'],
        learnerAnswer: 'Jeg dro på kino i går',
        matchesKey: false,
        mistakes: [{ wrong: 'går', fix: 'gikk', kind: 'form', state: 'attempted', submitted: 'dro' }],
        teacherNote: 'Preteritum.',
      });
      expect(user.sentences[1].mistakes).toEqual([{ wrong: 'bo', fix: 'bor', kind: 'form', state: 'missed', authorNote: 'Presens av «bo».' }]);
      expect(user.sentences[2]).toMatchObject({ matchesKey: true, mistakes: [] });
    });
  });

  it('skips a set nobody edited, and one with every switch off', () => {
    expect(unaskable(subject())).toBeNull();
    const untouched = subject();
    untouched.sentences = untouched.sentences.map((s) => ({ ...s, answer: s.given }));
    expect(unaskable(untouched)).toBe('empty_answer');
    expect(unaskable(subject({ explainWhy: false, altFixes: false, register: false }))).toBe('no_checks');
  });
});

describe('DraftReviewHandler — error_correction', () => {
  it('drafts a routed error_correction submission and writes the remarks', async () => {
    const found: ReviewSubjectResult = {
      attemptId: 'a1',
      userId: 'learner-1',
      schoolId: 'school-1',
      templateCode: 'error_correction',
      skip: null,
      subject: subject(),
    };
    const call = {
      routed: Result.ok({
        result: { output: { kind: 'structured', data: { items: [remark()], summary: null } }, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } },
        model: { model: { id: 'model-1', providerId: 'provider-1', providerModelId: 'fake-1' }, provider: { code: 'fake' } },
        role: 'primary',
        binding: { promptVersion: 'review_draft@1' },
        attempts: [],
      }),
      recorded: { callId: 'call-1', cost: null, credits: '0' },
      latencyMs: 5,
    } as unknown as GatewayCall;
    const systems: string[] = [];
    const gateway = {
      call: async (_capability: string, _context: unknown, build: GatewayInput) => {
        systems.push((typeof build === 'function' ? build('review_draft@1') : build).system!);
        return call;
      },
    } as unknown as AiGateway;
    const writes: unknown[] = [];
    const attempts: IReviewAttemptsClient = {
      getSubject: async () => found,
      putDraft: async (_id, draft) => {
        writes.push(draft);
        return { written: true };
      },
      listCases: async () => ({ cases: [], skipped: {} }),
    };
    const handler = new DraftReviewHandler(gateway, new SchoolPayerResolver(), attempts, { explanationLanguage: async () => 'uk' }, 0);

    const outcome = await handler.execute(new DraftReviewCommand('a1', 'learner-1', 'error_correction', 'school-1'));

    expect(outcome).toEqual({ kind: 'written', status: 'ready', remarks: 1, aiCallId: 'call-1' });
    expect(systems[0]).toContain('error-correction exercise');
    expect(systems[0]).toContain('in Ukrainian');
    expect(writes).toEqual([
      {
        status: 'ready',
        items: [{ itemId: 'e2', sentenceIndex: 2, aspect: 'grammar', fragment: 'bo', comment: 'Presens: bor.', suggestion: 'bor' }],
        summary: null,
      },
    ]);
  });
});

describe('scoreCase — error_correction', () => {
  const evalCase: ReviewCase = {
    caseId: 'a1',
    decidedAt: '2026-10-23T00:00:00.000Z',
    templateCode: 'error_correction',
    subject: subject(),
    offered: {
      modelId: 'm',
      promptVersion: 'review_draft@1',
      remarks: [
        { sentenceIndex: 1, itemId: 'e1', aspect: 'alternative', fragment: 'dro' },
        { sentenceIndex: 2, itemId: 'e2', aspect: 'grammar', fragment: 'bo' },
      ],
    },
    outcomes: { remarks: ['accepted', 'accepted'], summary: null, draftDiscarded: false },
    // The teacher took the alternative: sentence 1 accepted, sentence 2 returned.
    decisions: [
      { itemId: 'e1', approved: true },
      { itemId: 'e2', approved: false },
      { itemId: 'e3', approved: true },
    ],
  };

  it('finds a kept alternative like any kept remark, but does not read it as an error on the sentence', () => {
    const score = scoreCase(evalCase, [
      { sentenceIndex: 1, aspect: 'alternative', fragment: 'dro' },
      { sentenceIndex: 2, aspect: 'grammar', fragment: 'bo' },
    ]);
    expect(score.confirmedFound).toBe(2);
    expect(score.sentencesAgreed).toBe(3);
  });

  it('counts an error remark on an accepted repair against the sentence verdict', () => {
    expect(scoreCase(evalCase, [{ sentenceIndex: 1, aspect: 'lexis', fragment: 'dro' }]).sentencesAgreed).toBe(1);
  });
});
