import { SchemaGuard } from '../../providers/application/schema-guard.js';
import type { LlmRequest } from '../../providers/domain/llm-request.js';
import type { LlmResult } from '../../providers/domain/llm-result.js';
import { FakeLlmProvider } from '../../providers/infrastructure/fake/fake-llm.provider.js';
import { findCapability } from '../catalog.js';
import type {
  ErrorCorrectionSubject,
  ShortAnswerSubject,
  TranslateSubject,
  WritingTaskSubject,
} from '../review-draft/application/ports/review-attempts.client.js';
import { toReviewSubject } from '../review-draft/application/review-input.js';
import type { ReviewFrame } from '../review-draft/domain/review-remarks.js';
import type { RubricCriterion } from '../review-draft/domain/rubric-marks.js';
import { reviewRequest, type ReviewSubject } from '../review-draft/prompts/prompts.js';
import { toDirectSubject } from './application/direct-subject.js';
import { toDirectReview } from './domain/direct-review.js';
import { REVIEW_DIRECT_PROMPT_VERSIONS, directReviewRequest } from './prompts/prompts.js';

// Plan 79, step 2.2b: review_direct@1 — the learner's review and its verdict.

const translate: TranslateSubject = {
  template: 'translate',
  langs: { explain: 'Russisk', target: 'Norsk' },
  ai: { on: true, checks: { grammar: true, order: true, lexis: true } },
  sentences: [
    { itemId: 'i1', direction: 'to_target', source: 'Я живу в Осло уже два года.', refs: ['Jeg har bodd i Oslo i to år'], answer: 'Jeg bor i Oslo i to år.' },
    { itemId: 'i2', direction: 'from_target', source: 'Han kom ikke.', refs: ['Он не пришёл'], answer: 'Он не пришёл.' },
  ],
};

const errorCorrection: ErrorCorrectionSubject = {
  template: 'error_correction',
  targetLanguage: 'nb',
  note: '',
  ai: { on: true, checks: { explainWhy: true, altFixes: true } },
  sentences: [
    {
      itemId: 'e1',
      given: 'Jeg liker ikke ikke kaffe.',
      refs: ['Jeg liker ikke kaffe.'],
      answer: 'Jeg liker ikke kaffe.',
      matchesKey: true,
      mistakes: [{ wrong: 'ikke', fix: '', type: 'extra', state: 'fixed', submitted: '' }],
      stray: [],
    },
  ],
};

const RUBRIC: RubricCriterion[] = [
  { id: 'c-task', name: 'Oppgaveløsning', desc: '', weight: 2, levels: ['Svarer ikke', 'Ett punkt', 'De fleste', 'Alle'] },
  { id: 'c-lang', name: 'Språk', desc: '', weight: 1, levels: ['Uforståelig', 'Mange feil', 'Noen feil', 'Få feil'] },
];

const essay = (rubric: RubricCriterion[] | null): WritingTaskSubject => ({
  template: 'writing_task',
  targetLanguage: 'nb',
  mode: 'letter',
  instruction: 'Skriv et brev.',
  prompt: 'Du flytter til en ny by.',
  source: '',
  letter: { register: 'informal', recipient: 'Kari' },
  imageCaption: '',
  points: [{ text: 'Når du flytter', required: true, keywords: ['i mai'], phrased: true, ticked: true }],
  example: '',
  length: { words: 9, paragraphs: 3, minWords: 0, maxWords: 0 },
  // The draft switch is off: a learner's review is marked by the rubric all the same.
  ai: { on: true, checks: { grammar: true, task: true, draft: false } },
  rubric,
  text: 'Hei Kari!\n\nJeg flytte til Bergen i mai.\n\nHilsen Ola',
});

const shortAnswer: ShortAnswerSubject = {
  template: 'short_answer',
  targetLanguage: 'nb',
  instruction: '',
  ai: { on: true, checks: { grammar: false } },
  questions: [
    {
      itemId: 'q1',
      kind: 'reading',
      passage: 'Ali flyttet til Bergen fordi kona fikk jobb der.',
      prompt: 'Hvorfor flyttet Ali?',
      model: 'Kona fikk jobb.',
      why: '',
      elements: [{ label: 'Kona fikk jobb', required: true, hit: false }],
      verdict: 'fail',
      tooShort: false,
      answer: 'Fordi kona hans begynte å jobbe der.',
    },
    {
      itemId: 'q2',
      kind: 'opinion',
      passage: '',
      prompt: 'Vil du bo i Bergen?',
      model: '',
      why: '',
      elements: [{ label: 'En mening', required: true, hit: true }],
      verdict: 'pass',
      tooShort: false,
      answer: 'Ja, jeg liker regn.',
    },
  ],
};

const V1 = 'review_direct@1';

const request = (subject: ReviewSubject): LlmRequest => ({ ...directReviewRequest(V1, subject), maxOutputTokens: 2_000, timeoutMs: 10_000 });

const frameOf = (subject: ReviewSubject): ReviewFrame => subject.input;

const answered = (data: unknown): LlmResult => ({
  output: { kind: 'structured', data },
  stop: 'end',
  usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
  providerRequestId: null,
  latencyMs: 1,
});

const fakeAnswer = (subject: ReviewSubject) =>
  new FakeLlmProvider().complete(request(subject), {
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

const remark = (over: Record<string, unknown> = {}) => ({
  sentenceIndex: 1,
  aspect: 'grammar',
  fragment: 'bor',
  comment: ' Нужен perfektum. ',
  suggestion: 'har bodd',
  ...over,
});

const guard = new SchemaGuard();

describe('review_direct — capability and versions', () => {
  it('is in the catalog with its own prompt line, on the same floor as the draft', () => {
    const capability = findCapability('review_direct');
    expect(capability?.requiredFeatures).toEqual({ structuredOutput: 'json_mode' });
    expect(capability?.promptVersions).toEqual(['review_direct@1', 'review_direct@2']);
    expect(REVIEW_DIRECT_PROMPT_VERSIONS).not.toContain('review_draft@1');
    expect(() => directReviewRequest('review_draft@1', toDirectSubject(translate, null))).toThrow('review_draft@1');
  });

  // Plan 80, step 3d.
  it('opens @2 by its audience and leaves @1 as it was, whoever pays', () => {
    const subject = toDirectSubject(translate, 'ru');
    const alone = directReviewRequest('review_direct@2', subject, 'self_study');
    const school = directReviewRequest('review_direct@2', subject, 'school');

    expect(alone.system).toBe(directReviewRequest(V1, subject).system);
    expect(directReviewRequest(V1, subject, 'school').system).toBe(alone.system);
    expect(school.system).toMatch(/^You review a translation exercise for a learner of a school\./);
    expect(school.system).toContain('A teacher of the school may read the work later');
    expect(school.system).not.toContain('without a teacher');
    // Only the opening differs: the rules after it are the same.
    const rest = (system: string) => system.slice(system.indexOf('Be right rather than thorough'));
    expect(rest(school.system)).toBe(rest(alone.system));
    expect(school.responseSchema!.name).toBe(alone.responseSchema!.name);
  });

  it('leaves review_draft@1 addressed to the teacher', () => {
    const draft = reviewRequest('review_draft@1', toDirectSubject(translate, null));
    expect(draft.system).toMatch(/^You draft a review of a translation exercise for a language teacher/);
    expect(JSON.stringify(draft.responseSchema!.schema)).not.toContain('decisions');
  });
});

describe('review_direct@1 — translate', () => {
  const subject = toDirectSubject(translate, 'ru');
  const check = (data: unknown) => guard.check(answered(data), request(subject));
  const answer = (over: Record<string, unknown> = {}) => ({
    items: [remark()],
    decisions: { sentence_1: false, sentence_2: true },
    outcome: 'approved',
    summary: ' Хорошо, но повтори perfektum. ',
    ...over,
  });

  it('speaks to the learner, with nobody in between, and asks for a verdict and a summary', () => {
    const { system } = request(subject);
    expect(system).toMatch(/^You review a translation exercise for a learner who studies without a teacher/);
    expect(system).not.toContain('teacher reads your draft');
    expect(system).toContain('`sentence_N` is true when its answer is acceptable');
    expect(system).toContain('`outcome` is `returned` when the learner should do the work again');
    expect(system).toContain('`summary`: two or three sentences in Russian');
    expect(system).toContain('Never empty.');
  });

  it('sends the task as the draft does', () => {
    const draft = reviewRequest('review_draft@1', subject);
    expect(request(subject).messages).toEqual(draft.messages);
  });

  it("passes the fake model's answer through the guard: a decision on every sentence", async () => {
    const checked = guard.check(await fakeAnswer(subject), request(subject));
    expect(checked.isOk).toBe(true);
    const review = toDirectReview((checked.value.output as { data: unknown }).data, frameOf(subject));
    expect(review.verdict.decisions).toEqual([
      { itemId: 'i1', approved: false },
      { itemId: 'i2', approved: false },
    ]);
    expect(review.marks).toBeNull();
  });

  it('maps decisions to item ids and trims the text', () => {
    expect(check(answer()).isOk).toBe(true);
    expect(toDirectReview(answer(), frameOf(subject))).toEqual({
      items: [{ itemId: 'i1', sentenceIndex: 1, aspect: 'grammar', fragment: 'bor', comment: 'Нужен perfektum.', suggestion: 'har bodd' }],
      summary: 'Хорошо, но повтори perfektum.',
      marks: null,
      verdict: {
        outcome: 'approved',
        decisions: [
          { itemId: 'i1', approved: false },
          { itemId: 'i2', approved: true },
        ],
      },
    });
  });

  it('refuses a sentence left undecided, one that does not exist, and a decision that is not a yes or no', () => {
    expect(check(answer({ decisions: { sentence_1: true } })).isFail).toBe(true);
    expect(check(answer({ decisions: { sentence_1: true, sentence_2: true, sentence_3: true } })).isFail).toBe(true);
    expect(check(answer({ decisions: { sentence_1: true, sentence_2: 'maybe' } })).isFail).toBe(true);
  });

  it('refuses a missing, null or blank summary', () => {
    const { summary: _omit, ...withoutSummary } = answer();
    expect(check(withoutSummary).isFail).toBe(true);
    expect(check(answer({ summary: null })).isFail).toBe(true);
    const blank = check(answer({ summary: '   ' }));
    expect(blank.isFail).toBe(true);
    expect(blank.error.message).toContain('summary is blank');
  });

  it('refuses an outcome other than approved or returned, and marks on a set with no rubric', () => {
    expect(check(answer({ outcome: 'passed' })).isFail).toBe(true);
    expect(check(answer({ marks: {} })).isFail).toBe(true);
  });

  it('still checks the remarks: an invented quotation fails the whole answer', () => {
    expect(check(answer({ items: [remark({ fragment: 'har bodd' })] })).isFail).toBe(true);
  });
});

describe('review_direct@1 — error_correction', () => {
  const subject = toDirectSubject(errorCorrection, null);

  it('tells the learner an alternative repair is right too, and decides a key match as true', () => {
    const { system } = request(subject);
    expect(system).toContain('the remark tells the learner their version is right too');
    expect(system).not.toContain('tells the teacher');
    expect(system).toContain('`matchesKey: true` — always true');
  });

  it("passes the fake model's answer through the guard", async () => {
    const checked = guard.check(await fakeAnswer(subject), request(subject));
    expect(checked.isOk).toBe(true);
    expect(toDirectReview((checked.value.output as { data: unknown }).data, frameOf(subject)).verdict.decisions).toEqual([
      { itemId: 'e1', approved: false },
    ]);
  });
});

describe('review_direct@1 — writing_task', () => {
  it('marks by the rubric frozen on the attempt even with the draft switch off', () => {
    const subject = toDirectSubject(essay(RUBRIC), null);
    expect(subject.template === 'writing_task' && subject.input.rubric).toEqual(RUBRIC);
    // The draft, from the same subject, asks for no marks.
    const draft = reviewRequest('review_draft@2', toReviewSubject(essay(RUBRIC), null));
    expect(JSON.stringify(draft.responseSchema!.schema)).not.toContain('criterion');

    const { system, messages } = request(subject);
    expect(system).toContain('your marks are its result');
    expect(system).not.toContain('sentence_N');
    const text = (messages[0]!.parts[0] as { text: string }).text;
    expect(text.indexOf('"rubric"')).toBeGreaterThan(-1);
    expect(text.indexOf('"rubric"')).toBeLessThan(text.indexOf('"learnerText"'));
  });

  it("passes the fake model's marks through the guard — every criterion, by the schema alone", async () => {
    const subject = toDirectSubject(essay(RUBRIC), null);
    const checked = guard.check(await fakeAnswer(subject), request(subject));
    expect(checked.isOk).toBe(true);
    const review = toDirectReview((checked.value.output as { data: unknown }).data, frameOf(subject));
    expect(review.marks?.map((m) => m.criterionId)).toEqual(['c-task', 'c-lang']);
    expect(review.verdict.decisions).toEqual([]);
  });

  it('maps marks to the snapshot ids in rubric order and refuses a criterion left out', () => {
    const subject = toDirectSubject(essay(RUBRIC), null);
    const answer = {
      items: [{ sentenceIndex: 1, aspect: 'grammar', fragment: 'Jeg flytte', comment: 'Presens.', suggestion: 'Jeg flytter' }],
      marks: { criterion_2: { mark: 2, reason: ' Noen feil. ' }, criterion_1: { mark: 3, reason: 'Alle punkter.' } },
      outcome: 'approved',
      summary: 'Bra brev.',
    };
    expect(guard.check(answered(answer), request(subject)).isOk).toBe(true);
    expect(toDirectReview(answer, frameOf(subject)).marks).toEqual([
      { criterionId: 'c-task', mark: 3, reason: 'Alle punkter.' },
      { criterionId: 'c-lang', mark: 2, reason: 'Noen feil.' },
    ]);
    const { criterion_2: _omit, ...one } = answer.marks;
    expect(guard.check(answered({ ...answer, marks: one }), request(subject)).isFail).toBe(true);
    expect(guard.check(answered({ ...answer, marks: { ...answer.marks, criterion_1: { mark: 4, reason: 'x' } } }), request(subject)).isFail).toBe(true);
  });

  it('without a rubric, decides the text as an answer to the task', async () => {
    const subject = toDirectSubject(essay(null), null);
    expect(request(subject).system).toContain('`sentence_N` is true when its text is acceptable');
    const checked = guard.check(await fakeAnswer(subject), request(subject));
    expect(checked.isOk).toBe(true);
    const review = toDirectReview((checked.value.output as { data: unknown }).data, frameOf(subject));
    expect(review.verdict.decisions).toEqual([{ itemId: 'text', approved: false }]);
    expect(review.marks).toBeNull();
  });
});

describe('review_direct@1 — short_answer', () => {
  const subject = toDirectSubject(shortAnswer, null);

  it('decides each answer on its points, never on the opinion, and credits a point said in other words', () => {
    const { system } = request(subject);
    expect(system).toContain('the opinion itself is never wrong');
    expect(system).toContain("check's `found` and `checkVerdict` do not decide it");
    expect(system).toContain('the remark tells the learner the point counts');
  });

  it("passes the fake model's answer through the guard, a decision per question", async () => {
    const checked = guard.check(await fakeAnswer(subject), request(subject));
    expect(checked.isOk).toBe(true);
    expect(toDirectReview((checked.value.output as { data: unknown }).data, frameOf(subject)).verdict.decisions.map((d) => d.itemId)).toEqual([
      'q1',
      'q2',
    ]);
  });

  it('allows a content remark without a quotation, as the draft does', () => {
    const answer = {
      items: [{ sentenceIndex: 2, aspect: 'content', fragment: null, comment: 'Gi en grunn.', suggestion: null }],
      decisions: { sentence_1: true, sentence_2: false },
      outcome: 'approved',
      summary: 'Nesten.',
    };
    expect(guard.check(answered(answer), request(subject)).isOk).toBe(true);
  });
});
