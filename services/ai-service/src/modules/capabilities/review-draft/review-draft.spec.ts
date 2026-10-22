import { SchemaGuard } from '../../providers/application/schema-guard.js';
import type { LlmRequest } from '../../providers/domain/llm-request.js';
import type { LlmResult } from '../../providers/domain/llm-result.js';
import { FakeLlmProvider } from '../../providers/infrastructure/fake/fake-llm.provider.js';
import { enabledAspects } from './domain/review-aspect.js';
import { toReviewDraft, type TranslateReviewInput } from './domain/translate-review.js';
import { REVIEW_DRAFT_PROMPT_VERSIONS, reviewRequest } from './prompts/prompts.js';

const input: TranslateReviewInput = {
  langs: { explain: 'Russisk', target: 'Norsk' },
  commentLanguage: 'Russian',
  aspects: ['grammar', 'order', 'lexis'],
  sentences: [
    {
      itemId: 'i1',
      direction: 'to_target',
      source: 'Я живу в Осло уже два года.',
      refs: ['Jeg har bodd i Oslo i to år (nå|)'],
      answer: 'Jeg bor i Oslo i to år.',
      explanation: 'Perfektum: the state began in the past and still holds.',
      teacherNote: 'Watch for presens here.',
    },
    {
      itemId: 'i2',
      direction: 'from_target',
      source: 'I dag skal jeg ikke jobbe.',
      refs: ['Сегодня я не буду работать'],
      answer: 'Сегодня я не работаю.',
    },
    { itemId: 'i3', direction: 'to_target', source: 'Он не пришёл.', refs: ['Han kom ikke'], answer: '' },
  ],
};

const request = (): LlmRequest => ({
  ...reviewRequest('review_draft@1', { template: 'translate', input }),
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

const remark = (over: Record<string, unknown> = {}) => ({
  sentenceIndex: 1,
  aspect: 'grammar',
  fragment: 'bor',
  comment: ' Нужен perfektum. ',
  suggestion: 'har bodd',
  ...over,
});

describe('review_draft — translate, prompt v1', () => {
  const guard = new SchemaGuard();
  const check = (data: unknown) => guard.check(answered(data), request());

  it('keeps v1 among the versions a binding may name', () => {
    expect(REVIEW_DRAFT_PROMPT_VERSIONS).toContain('review_draft@1');
    expect(() => reviewRequest('review_draft@0', { template: 'translate', input })).toThrow('review_draft@0');
  });

  it("passes the fake model's answer through the guard", async () => {
    const result = await new FakeLlmProvider().complete(request(), {
      providerModelId: 'fake',
      features: {
        structuredOutput: 'native',
        tools: true,
        streaming: true,
        vision: false,
        audioIn: false,
        batch: false,
        promptCache: false,
        contextWindow: 200_000,
        maxOutput: 16_000,
      },
      provider: { code: 'fake', baseUrl: null, apiVersion: null, credentialRef: null },
    });
    const checked = guard.check(result, request());
    expect(checked.isOk).toBe(true);
    expect(toReviewDraft((checked.value.output as { data: unknown }).data, input)).toEqual({ items: [], summary: 'fake' });
  });

  it('accepts remarks that quote the answer verbatim', () => {
    const outcome = check({ items: [remark(), remark({ sentenceIndex: 2, aspect: 'lexis', fragment: 'не работаю', suggestion: null })], summary: null });
    expect(outcome.isOk).toBe(true);
  });

  it('refuses a quotation the learner did not write', () => {
    const outcome = check({ items: [remark({ fragment: 'har bodd' })], summary: null });
    expect(outcome.isFail).toBe(true);
    expect(outcome.error.code).toBe('invalid_response');
    expect(outcome.error.message).toContain('"har bodd" does not occur in the answer to sentence 1');
  });

  it("refuses a quotation from another sentence's answer", () => {
    expect(check({ items: [remark({ sentenceIndex: 2 })], summary: null }).isFail).toBe(true);
  });

  it('refuses any remark on an empty answer', () => {
    expect(check({ items: [remark({ sentenceIndex: 3, fragment: ' ' })], summary: null }).isFail).toBe(true);
  });

  it('refuses a fragment that differs only in case', () => {
    expect(check({ items: [remark({ fragment: 'Bor' })], summary: null }).isFail).toBe(true);
  });

  it('refuses an aspect the author switched off', () => {
    const outcome = check({ items: [remark({ aspect: 'register' })], summary: null });
    expect(outcome.isFail).toBe(true);
    expect(outcome.error.message).toContain('aspect');
  });

  it('refuses a sentence number outside the set', () => {
    expect(check({ items: [remark({ sentenceIndex: 4 })], summary: null }).isFail).toBe(true);
    expect(check({ items: [remark({ sentenceIndex: 0 })], summary: null }).isFail).toBe(true);
  });

  it('refuses missing or extra fields', () => {
    const { suggestion: _omit, ...withoutSuggestion } = remark();
    expect(check({ items: [withoutSuggestion], summary: null }).isFail).toBe(true);
    expect(check({ items: [remark({ severity: 'high' })], summary: null }).isFail).toBe(true);
    expect(check({ items: [] }).isFail).toBe(true);
  });

  it('maps sentence numbers to item ids and trims the text', () => {
    expect(toReviewDraft({ items: [remark(), remark({ suggestion: '  ' })], summary: '  ' }, input)).toEqual({
      items: [
        { itemId: 'i1', sentenceIndex: 1, aspect: 'grammar', fragment: 'bor', comment: 'Нужен perfektum.', suggestion: 'har bodd' },
        { itemId: 'i1', sentenceIndex: 1, aspect: 'grammar', fragment: 'bor', comment: 'Нужен perfektum.', suggestion: null },
      ],
      summary: null,
    });
  });

  describe('prompt', () => {
    const { system, messages } = request();
    const user = JSON.parse((messages[0]!.parts[0] as { text: string }).text);

    it('asks only for the enabled aspects', () => {
      expect(system).toContain('grammar —');
      expect(system).toContain('lexis —');
      expect(system).not.toContain('register —');
    });

    it('names the comment language and the languages of the exercise', () => {
      expect(system).toContain('in Russian');
      expect(system).toContain('studies Norsk');
    });

    it('sends each sentence numbered from 1, with its direction as a language and its answer as data', () => {
      expect(user.sentences.map((s: { number: number }) => s.number)).toEqual([1, 2, 3]);
      expect(user.sentences.map((s: { into: string }) => s.into)).toEqual(['Norsk', 'Russisk', 'Norsk']);
      expect(user.sentences[0]).toMatchObject({
        acceptedTranslations: ['Jeg har bodd i Oslo i to år (nå|)'],
        learnerAnswer: 'Jeg bor i Oslo i to år.',
        authorExplanation: 'Perfektum: the state began in the past and still holds.',
        teacherNote: 'Watch for presens here.',
      });
      expect(user.sentences[1]).not.toHaveProperty('authorExplanation');
    });
  });

  it('turns an ai.checks block into aspects in canonical order', () => {
    expect(enabledAspects({ register: true, grammar: true, order: false })).toEqual(['grammar', 'register']);
    expect(enabledAspects({})).toEqual([]);
  });
});
