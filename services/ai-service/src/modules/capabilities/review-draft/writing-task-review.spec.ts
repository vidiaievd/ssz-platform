import type { AiGateway, GatewayCall } from '../../gateway/application/ai-gateway.js';
import type { GatewayInput } from '../../gateway/application/model-router.js';
import { SchemaGuard } from '../../providers/application/schema-guard.js';
import type { LlmRequest } from '../../providers/domain/llm-request.js';
import type { LlmResult } from '../../providers/domain/llm-result.js';
import { Result } from '../../../shared/kernel/result.js';
import { DraftReviewCommand } from './application/draft-review/draft-review.command.js';
import { DraftReviewHandler } from './application/draft-review/draft-review.handler.js';
import type { IReviewAttemptsClient, ReviewSubjectResult, WritingTaskSubject } from './application/ports/review-attempts.client.js';
import { toReviewSubject, unaskable } from './application/review-input.js';
import { SchoolPayerResolver } from './application/school-payer.resolver.js';
import { writingTaskAspects } from './domain/review-aspect.js';
import { reviewSchema, toReviewDraft } from './domain/review-remarks.js';
import { reviewRequest } from './prompts/prompts.js';

// Plan 79, step 1.7b: writing_task.

const TEXT = 'Hei Kari!\n\nJeg flytte til Bergen i mai. Jeg gleder meg.\n\nHilsen Ola';

const subject = (checks = { grammar: true, task: true, structure: true, lexis: false }): WritingTaskSubject => ({
  template: 'writing_task',
  targetLanguage: 'nb',
  mode: 'letter',
  instruction: 'Skriv et brev.',
  prompt: 'Du flytter til en ny by.',
  source: '',
  letter: { register: 'informal', recipient: 'Kari' },
  imageCaption: '',
  points: [
    { text: 'Når du flytter', required: true, keywords: ['i mai'], phrased: true, ticked: true },
    { text: 'Hvorfor du flytter', required: true, keywords: ['fordi'], phrased: false, ticked: false },
  ],
  example: 'Hei Kari! Jeg flytter til Bergen i mai fordi …',
  length: { words: 12, paragraphs: 3, minWords: 50, maxWords: 0 },
  ai: { on: true, checks },
  text: TEXT,
});

const prepared = toReviewSubject(subject(), null);
const input = prepared.template === 'writing_task' ? prepared.input : (null as never);

const request = (): LlmRequest => ({ ...reviewRequest('review_draft@1', prepared), maxOutputTokens: 2_000, timeoutMs: 10_000 });

const answered = (data: unknown): LlmResult => ({
  output: { kind: 'structured', data },
  stop: 'end',
  usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
  providerRequestId: null,
  latencyMs: 1,
});

const remark = (over: Record<string, unknown> = {}) => ({
  sentenceIndex: 1,
  aspect: 'grammar',
  fragment: 'Jeg flytte',
  comment: 'Presens: flytter.',
  suggestion: 'Jeg flytter',
  ...over,
});

const missingPoint = remark({ aspect: 'task', fragment: null, comment: 'Du skriver ikke hvorfor du flytter.', suggestion: null });

describe('review_draft — writing_task, prompt v1', () => {
  const guard = new SchemaGuard();
  const check = (data: unknown) => guard.check(answered(data), request());

  it('reads the AI stage switches as aspects; draft asks for marks, not remarks', () => {
    expect(writingTaskAspects({ grammar: true, task: true, structure: true, lexis: true })).toEqual(['grammar', 'lexis', 'structure', 'task']);
    expect(writingTaskAspects({ grammar: false, lexis: true })).toEqual(['lexis']);
    expect(writingTaskAspects({})).toEqual([]);
  });

  it('frames the essay as one sentence, the whole text, under a fixed item id', () => {
    expect(input.sentences).toEqual([{ itemId: 'text', answer: TEXT }]);
    expect(input.targetLanguage).toBe('Norwegian Bokmål');
    expect(input.commentLanguage).toBe('Norwegian Bokmål');
    const withSchool = toReviewSubject(subject(), 'ru');
    expect(withSchool.template === 'writing_task' && withSchool.input.commentLanguage).toBe('Russian');
  });

  it('accepts a quoted grammar remark and a task remark about the text as a whole', () => {
    const outcome = check({ items: [remark(), missingPoint], summary: 'Bra brev.' });
    expect(outcome.isOk).toBe(true);
    const draft = toReviewDraft((outcome.value.output as { data: unknown }).data, input);
    expect(draft.items).toEqual([
      { itemId: 'text', sentenceIndex: 1, aspect: 'grammar', fragment: 'Jeg flytte', comment: 'Presens: flytter.', suggestion: 'Jeg flytter' },
      { itemId: 'text', sentenceIndex: 1, aspect: 'task', fragment: null, comment: 'Du skriver ikke hvorfor du flytter.', suggestion: null },
    ]);
  });

  it('refuses a grammar remark without a quotation, and an invented one', () => {
    const unquoted = check({ items: [remark({ fragment: null })], summary: null });
    expect(unquoted.isFail).toBe(true);
    expect(unquoted.error.message).toContain('aspect grammar must quote the answer');

    const invented = check({ items: [remark({ fragment: 'Jeg flyttet' })], summary: null });
    expect(invented.isFail).toBe(true);
    expect(invented.error.message).toContain('"Jeg flyttet" does not occur');
  });

  it('refuses a sentence beyond the one text, and an aspect the author switched off', () => {
    expect(check({ items: [remark({ sentenceIndex: 2 })], summary: null }).isFail).toBe(true);
    expect(check({ items: [remark({ aspect: 'lexis' })], summary: null }).isFail).toBe(true);
    // order is translate's aspect: an essay folds word order into grammar.
    expect(check({ items: [remark({ aspect: 'order' })], summary: null }).isFail).toBe(true);
  });

  it('allows a null quotation only when a whole-text aspect is on — other templates keep their schema', () => {
    const fragment = (frame: Parameters<typeof reviewSchema>[0]) =>
      ((reviewSchema(frame).properties as any).items.items.properties.fragment as { type: unknown }).type;
    expect(fragment(input)).toEqual(['string', 'null']);
    const languageOnly = toReviewSubject(subject({ grammar: true, task: false, structure: false, lexis: true }), null);
    expect(fragment(languageOnly.input)).toBe('string');
    expect(fragment({ aspects: ['grammar', 'order'], sentences: [{ itemId: 's1', answer: 'x' }] })).toBe('string');
  });

  describe('prompt', () => {
    const { system, messages, responseSchema } = request();
    const user = JSON.parse((messages[0]!.parts[0] as { text: string }).text);

    it('asks for the enabled aspects and says which may go unquoted', () => {
      expect(system).toContain('grammar —');
      expect(system).toContain('task —');
      expect(system).toContain('structure —');
      expect(system).not.toContain('lexis —');
      expect(system).toContain('A remark of aspect structure or task may be about the text as a whole');
      expect(system).toContain('`exampleAnswer`, when given, is one possible text');
      expect(responseSchema!.name).toBe('writing_task_review');
    });

    it('without whole-text aspects, says nothing about remarks without a quotation', () => {
      const off = reviewRequest('review_draft@1', toReviewSubject(subject({ grammar: true, task: false, structure: false, lexis: true }), null));
      expect(off.system).not.toContain('may be about the text as a whole');
    });

    it('sends the task, the points as measured, and the text', () => {
      expect(user).toEqual({
        textType: 'letter',
        instruction: 'Skriv et brev.',
        situation: 'Du flytter til en ny by.',
        letter: { register: 'informal', recipient: 'Kari' },
        points: [
          { point: 'Når du flytter', required: true, keywords: ['i mai'], phrased: true, ticked: true },
          { point: 'Hvorfor du flytter', required: true, keywords: ['fordi'], phrased: false, ticked: false },
        ],
        // No ceiling set: no maxWords.
        length: { words: 12, paragraphs: 3, minWords: 50 },
        exampleAnswer: 'Hei Kari! Jeg flytter til Bergen i mai fordi …',
        learnerText: TEXT,
      });
    });
  });

  it('skips a blank text, a stage switched off and one with every switch off', () => {
    expect(unaskable(subject())).toBeNull();
    expect(unaskable({ ...subject(), text: '  \n ' })).toBe('empty_answer');
    expect(unaskable({ ...subject(), ai: { on: false, checks: { grammar: true } } })).toBe('ai_off');
    expect(unaskable(subject({ grammar: false, task: false, structure: false, lexis: false }))).toBe('no_checks');
  });
});

describe('DraftReviewHandler — writing_task', () => {
  it('drafts a routed essay and writes the remarks, whole-text ones included', async () => {
    const found: ReviewSubjectResult = {
      attemptId: 'a1',
      userId: 'learner-1',
      schoolId: 'school-1',
      templateCode: 'writing_task',
      skip: null,
      subject: subject(),
    };
    const call = {
      routed: Result.ok({
        result: {
          output: { kind: 'structured', data: { items: [remark(), missingPoint], summary: null } },
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

    const outcome = await handler.execute(new DraftReviewCommand('a1', 'learner-1', 'writing_task', 'school-1'));

    expect(outcome).toEqual({ kind: 'written', status: 'ready', remarks: 2, aiCallId: 'call-1' });
    expect(systems[0]).toContain('review of a written text');
    expect(systems[0]).toContain('in Ukrainian');
    expect(writes).toEqual([
      {
        status: 'ready',
        items: [
          { itemId: 'text', sentenceIndex: 1, aspect: 'grammar', fragment: 'Jeg flytte', comment: 'Presens: flytter.', suggestion: 'Jeg flytter' },
          { itemId: 'text', sentenceIndex: 1, aspect: 'task', fragment: null, comment: 'Du skriver ikke hvorfor du flytter.', suggestion: null },
        ],
        summary: null,
      },
    ]);
  });
});
