import { SchemaGuard } from '../../providers/application/schema-guard.js';
import type { LlmRequest } from '../../providers/domain/llm-request.js';
import type { LlmResult } from '../../providers/domain/llm-result.js';
import type { WritingTaskSubject } from './application/ports/review-attempts.client.js';
import { toReviewSubject } from './application/review-input.js';
import { toReviewDraft } from './domain/review-remarks.js';
import type { RubricCriterion } from './domain/rubric-marks.js';
import { REVIEW_DRAFT_PROMPT_VERSIONS, reviewRequest, type ReviewSubject } from './prompts/prompts.js';

// Plan 79, step 1.7c: suggested rubric marks on writing_task, prompt v2.

const TEXT = 'Hei Kari!\n\nJeg flytte til Bergen i mai.\n\nHilsen Ola';

const RUBRIC: RubricCriterion[] = [
  { id: 'c-task', name: 'Oppgaveløsning', desc: 'Er punktene dekket?', weight: 2, levels: ['Svarer ikke', 'Ett punkt', 'De fleste', 'Alle'] },
  { id: 'c-lang', name: 'Språk', desc: '', weight: 1, levels: ['Uforståelig', 'Mange feil', 'Noen feil', ''] },
];

const subject = (over: { draft?: boolean; rubric?: RubricCriterion[] | null } = {}): WritingTaskSubject => ({
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
  ai: { on: true, checks: { grammar: true, task: true, structure: false, lexis: false, draft: over.draft ?? true } },
  rubric: over.rubric === undefined ? RUBRIC : over.rubric,
  text: TEXT,
});

const prepared = toReviewSubject(subject(), null);
const input = prepared.template === 'writing_task' ? prepared.input : (null as never);

const request = (version: string, of: ReviewSubject = prepared): LlmRequest => ({
  ...reviewRequest(version, of),
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

const marks = (...entries: Array<[number, number]>) =>
  entries.map(([criterionIndex, mark]) => ({ criterionIndex, mark, reason: ` Nivå ${mark}. ` }));

describe('review_draft@2 — suggested rubric marks', () => {
  const guard = new SchemaGuard();
  const check = (data: unknown) => guard.check(answered(data), request('review_draft@2'));

  it('is a known prompt version beside v1', () => {
    expect(REVIEW_DRAFT_PROMPT_VERSIONS).toEqual(['review_draft@1', 'review_draft@2']);
  });

  it('asks for marks only when the draft switch is on and the attempt carries a rubric', () => {
    expect(input.rubric).toEqual(RUBRIC);
    const off = toReviewSubject(subject({ draft: false }), null);
    expect(off.template === 'writing_task' && off.input.rubric).toBeNull();
    const none = toReviewSubject(subject({ rubric: null }), null);
    expect(none.template === 'writing_task' && none.input.rubric).toBeNull();
    // An engine that predates the step sends no rubric at all.
    const { rubric: _omitted, ...older } = subject();
    const old = toReviewSubject(older, null);
    expect(old.template === 'writing_task' && old.input.rubric).toBeNull();
  });

  it('without marks to ask for, v2 is v1 byte for byte', () => {
    const off = toReviewSubject(subject({ draft: false }), null);
    expect(JSON.stringify(request('review_draft@2', off))).toBe(JSON.stringify(request('review_draft@1', off)));
  });

  it('leaves translate and error_correction as they were under v1', () => {
    const translate: ReviewSubject = {
      template: 'translate',
      input: {
        langs: { explain: 'ru', target: 'nb' },
        commentLanguage: 'Russian',
        aspects: ['grammar'],
        sentences: [{ itemId: 's1', direction: 'to_target', source: 'Я живу', refs: ['Jeg bor'], answer: 'Jeg bor' }],
      },
    };
    expect(JSON.stringify(request('review_draft@2', translate))).toBe(JSON.stringify(request('review_draft@1', translate)));
  });

  it('v1 does not ask for marks even when the rubric is there', () => {
    const { system, responseSchema } = request('review_draft@1');
    expect(system).not.toContain('Suggested marks');
    expect((responseSchema!.schema as { required: string[] }).required).toEqual(['items', 'summary']);
  });

  it('sends the rubric numbered, before the text', () => {
    const { system, messages, responseSchema } = request('review_draft@2');
    const text = (messages[0]!.parts[0] as { text: string }).text;
    const user = JSON.parse(text);
    expect(system).toContain('Suggested marks');
    expect(user.rubric).toEqual([
      { criterion: 1, name: 'Oppgaveløsning', about: 'Er punktene dekket?', weight: 2, levels: { 0: 'Svarer ikke', 1: 'Ett punkt', 2: 'De fleste', 3: 'Alle' } },
      // No blurb, no `about`; an empty descriptor reads as a dash, not as nothing.
      { criterion: 2, name: 'Språk', weight: 1, levels: { 0: 'Uforståelig', 1: 'Mange feil', 2: 'Noen feil', 3: '—' } },
    ]);
    expect(Object.keys(user).slice(-2)).toEqual(['rubric', 'learnerText']);
    expect((responseSchema!.schema as { required: string[] }).required).toEqual(['items', 'summary', 'marks']);
  });

  it('accepts one mark per criterion and maps them to the snapshot ids in rubric order', () => {
    const outcome = check({ items: [], summary: null, marks: marks([2, 1], [1, 3]) });
    expect(outcome.isOk).toBe(true);
    const draft = toReviewDraft((outcome.value.output as { data: unknown }).data, input);
    expect(draft.marks).toEqual([
      { criterionId: 'c-task', mark: 3, reason: 'Nivå 3.' },
      { criterionId: 'c-lang', mark: 1, reason: 'Nivå 1.' },
    ]);
  });

  it('refuses a criterion left out, marked twice, or out of range, and a mark past 3', () => {
    expect(check({ items: [], summary: null, marks: marks([1, 2]) }).error?.message).toContain('1 criteria are not marked');
    expect(check({ items: [], summary: null, marks: marks([1, 2], [1, 1]) }).error?.message).toContain('marked twice');
    expect(check({ items: [], summary: null, marks: marks([1, 2], [3, 1]) }).isFail).toBe(true);
    expect(check({ items: [], summary: null, marks: marks([1, 4], [2, 1]) }).isFail).toBe(true);
    expect(check({ items: [], summary: null }).isFail).toBe(true);
  });

  it('still checks the remarks: an invented quotation fails the whole answer', () => {
    const remark = { sentenceIndex: 1, aspect: 'grammar', fragment: 'Jeg flyttet', comment: 'x', suggestion: null };
    expect(check({ items: [remark], summary: null, marks: marks([1, 2], [2, 2]) }).error?.message).toContain('does not occur');
  });

  it('a draft asked without marks carries none', () => {
    expect(toReviewDraft({ items: [], summary: null }, input).marks).toBeNull();
  });
});
