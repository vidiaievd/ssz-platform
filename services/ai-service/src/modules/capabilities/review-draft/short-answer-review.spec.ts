import type { AiGateway, GatewayCall } from '../../gateway/application/ai-gateway.js';
import type { GatewayInput } from '../../gateway/application/model-router.js';
import { SchemaGuard } from '../../providers/application/schema-guard.js';
import type { LlmRequest } from '../../providers/domain/llm-request.js';
import type { LlmResult } from '../../providers/domain/llm-result.js';
import { Result } from '../../../shared/kernel/result.js';
import { DraftReviewCommand } from './application/draft-review/draft-review.command.js';
import { DraftReviewHandler } from './application/draft-review/draft-review.handler.js';
import type { IReviewAttemptsClient, ReviewSubjectResult, ShortAnswerSubject } from './application/ports/review-attempts.client.js';
import { subjectSentences, toReviewSubject, unaskable } from './application/review-input.js';
import { SchoolPayerResolver } from './application/school-payer.resolver.js';
import { scoreCase } from './eval/domain/eval-score.js';
import type { ReviewCase } from './eval/domain/review-case.js';
import { shortAnswerAspects } from './domain/review-aspect.js';
import { toReviewDraft } from './domain/review-remarks.js';
import { reviewRequest } from './prompts/prompts.js';

// Plan 79, step 1.7e: short_answer.

const ANSWER_1 = 'Han flyttet til Bergen fordi kona fikk jobb der.';
const ANSWER_2 = 'Jeg synes det er bra å bo i en liten by.';

const subject = (grammar = false): ShortAnswerSubject => ({
  template: 'short_answer',
  targetLanguage: 'nb',
  instruction: 'Svar med én til tre setninger.',
  ai: { on: true, checks: { grammar } },
  questions: [
    {
      itemId: 'q1',
      kind: 'reading',
      passage: 'Ali flyttet til Bergen i 2019. Kona hans fikk jobb på sykehuset der.',
      prompt: 'Hvorfor flyttet Ali til Bergen?',
      model: 'Fordi kona hans fikk jobb på sykehuset.',
      why: 'Teksten sier at kona fikk jobb.',
      elements: [
        { label: 'Kona fikk jobb', required: true, hit: false },
        { label: 'På sykehuset', required: false, hit: false },
      ],
      verdict: 'fail',
      tooShort: false,
      answer: ANSWER_1,
    },
    {
      itemId: 'q2',
      kind: 'opinion',
      passage: '',
      prompt: 'Vil du bo i en liten by?',
      model: '',
      why: '',
      elements: [
        { label: 'En mening', required: true, hit: true },
        { label: 'En grunn', required: true, hit: false },
      ],
      verdict: 'partial',
      tooShort: false,
      answer: ANSWER_2,
    },
  ],
});

const prepared = toReviewSubject(subject(), null);
const input = prepared.template === 'short_answer' ? prepared.input : (null as never);

const request = (grammar = false): LlmRequest => ({
  ...reviewRequest('review_draft@1', toReviewSubject(subject(grammar), null)),
  maxOutputTokens: 2_000,
  timeoutMs: 10_000,
});

const answered = (data: unknown): LlmResult => ({
  output: { kind: 'structured', data },
  stop: 'end',
  usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
  providerRequestId: null,
  latencyMs: 1,
});

/** The check looked for «kona hans fikk jobb»; the learner wrote «kona fikk jobb». */
const credited = {
  sentenceIndex: 1,
  aspect: 'alternative',
  fragment: 'kona fikk jobb der',
  comment: 'Du sier at kona fikk jobb — det er riktig.',
  suggestion: null,
};
const noReason = {
  sentenceIndex: 2,
  aspect: 'content',
  fragment: null,
  comment: 'Du sier ikke hvorfor.',
  suggestion: null,
};

describe('review_draft — short_answer, prompt v1', () => {
  const guard = new SchemaGuard();
  const check = (data: unknown, grammar = false) => guard.check(answered(data), request(grammar));

  it('reads the AI stage as content always, grammar and spelling under its second switch', () => {
    expect(shortAnswerAspects({ grammar: false })).toEqual(['content', 'alternative']);
    expect(shortAnswerAspects({ grammar: true })).toEqual(['content', 'alternative', 'grammar', 'lexis']);
    expect(shortAnswerAspects({})).toEqual(['content', 'alternative']);
  });

  it('frames one sentence per answered question, keyed by question id', () => {
    expect(input.sentences).toEqual([
      { itemId: 'q1', answer: ANSWER_1 },
      { itemId: 'q2', answer: ANSWER_2 },
    ]);
    expect(subjectSentences(subject())).toEqual(input.sentences);
    expect(input.commentLanguage).toBe('Norwegian Bokmål');
    const withSchool = toReviewSubject(subject(), 'ru');
    expect(withSchool.template === 'short_answer' && withSchool.input.commentLanguage).toBe('Russian');
  });

  it('accepts a credited key point and a missing one without a quotation', () => {
    const outcome = check({ items: [credited, noReason], summary: null });
    expect(outcome.isOk).toBe(true);
    const draft = toReviewDraft((outcome.value.output as { data: unknown }).data, input);
    expect(draft.items).toEqual([
      { itemId: 'q1', sentenceIndex: 1, aspect: 'alternative', fragment: 'kona fikk jobb der', comment: credited.comment, suggestion: null },
      { itemId: 'q2', sentenceIndex: 2, aspect: 'content', fragment: null, comment: noReason.comment, suggestion: null },
    ]);
    expect(draft.marks).toBeNull();
  });

  it('refuses a quotation from another answer, an unquoted alternative and a third question', () => {
    // «liten by» is in the second answer, not the first.
    const elsewhere = check({ items: [{ ...credited, fragment: 'liten by' }], summary: null });
    expect(elsewhere.isFail).toBe(true);
    expect(elsewhere.error.message).toContain('does not occur in the answer to sentence 1');

    const unquoted = check({ items: [{ ...credited, fragment: null }], summary: null });
    expect(unquoted.error.message).toContain('aspect alternative must quote the answer');

    expect(check({ items: [{ ...noReason, sentenceIndex: 3 }], summary: null }).isFail).toBe(true);
  });

  it('admits grammar and spelling only under the second switch', () => {
    const grammar = { sentenceIndex: 2, aspect: 'grammar', fragment: 'liten', comment: '…', suggestion: 'lita' };
    expect(check({ items: [grammar], summary: null }).isFail).toBe(true);
    expect(check({ items: [grammar], summary: null }, true).isOk).toBe(true);
  });

  describe('prompt', () => {
    const { system, messages, responseSchema } = request();
    const user = JSON.parse((messages[0]!.parts[0] as { text: string }).text);

    it('explains what the check cannot judge, and asks for content only', () => {
      expect(system).toContain('content —');
      expect(system).toContain('alternative —');
      expect(system).not.toContain('grammar —');
      expect(system).toContain('Do not report grammar or spelling');
      expect(system).toContain('it misses a point made in other words');
      expect(system).toContain('never argue with the learner\'s opinion');
      expect(responseSchema!.name).toBe('short_answer_review');
      expect(request(true).system).toContain('A remark of aspect grammar or lexis is about one error');
    });

    it('sends each question with its passage, key points as found and the answer', () => {
      expect(user).toEqual({
        instruction: 'Svar med én til tre setninger.',
        questions: [
          {
            number: 1,
            kind: 'reading',
            passage: 'Ali flyttet til Bergen i 2019. Kona hans fikk jobb på sykehuset der.',
            question: 'Hvorfor flyttet Ali til Bergen?',
            keyPoints: [
              { point: 'Kona fikk jobb', required: true, found: false },
              { point: 'På sykehuset', required: false, found: false },
            ],
            modelAnswer: 'Fordi kona hans fikk jobb på sykehuset.',
            why: 'Teksten sier at kona fikk jobb.',
            checkVerdict: 'fail',
            learnerAnswer: ANSWER_1,
          },
          // An opinion: no passage, no model answer.
          {
            number: 2,
            kind: 'opinion',
            question: 'Vil du bo i en liten by?',
            keyPoints: [
              { point: 'En mening', required: true, found: true },
              { point: 'En grunn', required: true, found: false },
            ],
            checkVerdict: 'partial',
            learnerAnswer: ANSWER_2,
          },
        ],
      });
    });

    it('has the same wording under v2', () => {
      expect(reviewRequest('review_draft@2', prepared).system).toBe(reviewRequest('review_draft@1', prepared).system);
    });
  });

  it('skips a set of blank answers and a stage switched off; never "no checks"', () => {
    expect(unaskable(subject())).toBeNull();
    const blank = subject();
    blank.questions = blank.questions.map((q) => ({ ...q, answer: ' ' }));
    expect(unaskable(blank)).toBe('empty_answer');
    expect(unaskable({ ...subject(), ai: { on: false, checks: { grammar: true } } })).toBe('ai_off');
  });

  it('scores a candidate against the teacher by question: a missing point matches by aspect, a credit by place', () => {
    const evalCase: ReviewCase = {
      caseId: 'a1',
      decidedAt: '2026-10-24T00:00:00.000Z',
      templateCode: 'short_answer',
      subject: subject(),
      offered: {
        modelId: 'm',
        promptVersion: 'review_draft@1',
        remarks: [
          { sentenceIndex: 2, itemId: 'q2', aspect: 'content', fragment: null },
          { sentenceIndex: 1, itemId: 'q1', aspect: 'content', fragment: 'Bergen' },
        ],
      },
      outcomes: { remarks: ['accepted', 'discarded'], summary: null, draftDiscarded: false },
      // A short_answer verdict stands over the whole set.
      decisions: [],
    };
    const score = scoreCase(evalCase, [
      { sentenceIndex: 2, aspect: 'content', fragment: null },
      // Same aspect, no quotation — but about the first answer, not the second.
      { sentenceIndex: 1, aspect: 'content', fragment: null },
      { sentenceIndex: 1, aspect: 'alternative', fragment: 'til Bergen' },
    ]);
    expect(score).toMatchObject({ confirmed: 1, confirmedFound: 1, rejected: 1, rejectedRepeated: 1, sentences: 0 });
    expect(score.remarks.map((r) => r.verdict)).toEqual(['confirmed', 'unjudged', 'rejected']);
  });
});

describe('DraftReviewHandler — short_answer', () => {
  it('drafts a routed set and writes remarks under the questions they are about', async () => {
    const found: ReviewSubjectResult = {
      attemptId: 'a1',
      userId: 'learner-1',
      schoolId: 'school-1',
      templateCode: 'short_answer',
      skip: null,
      subject: subject(),
    };
    const call = {
      routed: Result.ok({
        result: {
          output: { kind: 'structured', data: { items: [credited, noReason], summary: 'Gode svar.' } },
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
        },
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

    const outcome = await handler.execute(new DraftReviewCommand('a1', 'learner-1', 'short_answer', 'school-1'));

    expect(outcome).toEqual({ kind: 'written', status: 'ready', remarks: 2, aiCallId: 'call-1' });
    expect(systems[0]).toContain('answers to open questions');
    expect(systems[0]).toContain('in Ukrainian');
    expect(writes).toEqual([
      {
        status: 'ready',
        items: [
          { itemId: 'q1', sentenceIndex: 1, aspect: 'alternative', fragment: 'kona fikk jobb der', comment: credited.comment, suggestion: null },
          { itemId: 'q2', sentenceIndex: 2, aspect: 'content', fragment: null, comment: noReason.comment, suggestion: null },
        ],
        summary: 'Gode svar.',
        marks: null,
      },
    ]);
  });
});
