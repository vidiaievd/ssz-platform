import { TranslateValidator } from '../../../../src/infrastructure/validation/validators/translate.validator.js';

const validator = new TranslateValidator();

/** The content column: what a student may see. No translation of anything is in here. */
const content = {
  dir: 'to_target',
  langs: { explain: 'Russisk', target: 'Norsk' },
  format: 'set',
  items: [
    { id: 's1', dir: 'to_target', source: 'Я живу в Тромсё уже три года.' },
    { id: 's2', dir: 'to_target', source: 'Мне нравятся кошки.' },
  ],
};

/** The expected_answers column: the key, keyed by item id. */
const expectedAnswers = {
  items: {
    s1: {
      refs: ['Jeg har bodd i Tromsø i tre år nå.'],
      require: [{ text: 'har bodd', note: 'Задание тренирует презенс перфект.' }],
    },
    s2: { refs: ['Jeg (liker|elsker) katter.'] },
  },
};

const run = (
  answers: Record<string, string>,
  overrides: { content?: unknown; expectedAnswers?: unknown; templateCode?: string } = {},
) =>
  validator.validate({
    submittedAnswer: {
      answers: Object.entries(answers).map(([itemId, text]) => ({ itemId, text })),
    },
    expectedAnswers: overrides.expectedAnswers ?? expectedAnswers,
    content: overrides.content ?? content,
    templateCode: overrides.templateCode ?? 'translate_to_target',
    checkSettings: {},
    targetLanguage: 'nb',
  });

const perfect = {
  s1: 'Jeg har bodd i Tromsø i tre år nå.',
  s2: 'Jeg liker katter.',
};

const detail = (result: ReturnType<typeof run>, itemId: string) =>
  (
    result.value.details as {
      items: Array<{
        itemId: string;
        verdict: string;
        ref: string;
        submitted: string;
        prompt: string | null;
        note: string | null;
      }>;
    }
  ).items.find((item) => item.itemId === itemId);

describe('TranslateValidator', () => {
  it('passes a set where every sentence hits a variant of the key', () => {
    const result = run(perfect);

    expect(result.isOk).toBe(true);
    expect(result.value.requiresReview).toBe(false);
    expect(result.value.correct).toBe(true);
    expect(result.value.score).toBe(100);
  });

  // The whole reason this validator exists: before it, the line above went to a teacher
  // together with an empty answer.
  it('reaches an inline alternative of the key', () => {
    const result = run({ ...perfect, s2: 'Jeg elsker katter.' });

    expect(result.value.requiresReview).toBe(false);
    expect(detail(result, 's2')?.verdict).toBe('exact');
  });

  it('ignores case and punctuation, which this template does not train', () => {
    const result = run({ ...perfect, s2: 'jeg liker katter' });

    expect(result.value.requiresReview).toBe(false);
  });

  // The rule the template rests on: a machine may approve, never reject.
  it('routes a single typo to the teacher rather than marking it wrong', () => {
    const result = run({ ...perfect, s2: 'Jeg liker kattar.' });

    expect(result.value.requiresReview).toBe(true);
    expect(result.value.correct).toBe(false);
    expect(result.value.score).toBe(0);
    expect(detail(result, 's2')?.verdict).toBe('typo');
  });

  it('routes an unanswered sentence, and says so per sentence', () => {
    const result = run({ s1: perfect.s1 });

    expect(result.value.requiresReview).toBe(true);
    expect(detail(result, 's1')?.verdict).toBe('exact');
    expect(detail(result, 's2')?.verdict).toBe('empty');
    expect(result.value.details).toMatchObject({ totalItems: 2, routedItems: 1, passedItems: 1 });
  });

  // A guard is the one deviation the engine can name exactly, so an answer that reaches
  // the key while dodging the form it trains is a question for a person.
  it('demotes a hit that dodges a required form', () => {
    const result = run({
      ...perfect,
      s1: 'Jeg bor i Tromsø i tre år nå.',
    });

    expect(result.value.requiresReview).toBe(true);
    const item = detail(result, 's1') as unknown as { missing: { text: string; note?: string }[] };
    expect(item.missing).toEqual([
      { text: 'har bodd', note: 'Задание тренирует презенс перфект.' },
    ]);
  });

  it('carries what the student wrote and what it was judged against, for the queue', () => {
    const result = run({ ...perfect, s1: 'Jeg bodde i Tromsø i tre år.' });
    const item = detail(result, 's1') as unknown as {
      submitted: string;
      ref: string;
      similarity: number;
      routing: string;
    };

    expect(item.submitted).toBe('Jeg bodde i Tromsø i tre år.');
    expect(item.ref).toBe('Jeg har bodd i Tromsø i tre år nå.');
    expect(item.similarity).toBeGreaterThan(0.5);
    expect(item.routing).toBe('teacher');
  });

  // `single` shows the first sentence and ignores the rest; grading the rest would fail
  // the student on sentences they were never shown.
  it('grades only the first sentence of a single-format exercise', () => {
    const result = run({ s1: perfect.s1 }, { content: { ...content, format: 'single' } });

    expect(result.value.requiresReview).toBe(false);
    expect(result.value.details).toMatchObject({ totalItems: 1 });
  });

  it('routes an exercise whose author left no key rather than passing it', () => {
    const result = run(
      { s1: 'hva som helst' },
      {
        content: { ...content, items: [content.items[0]] },
        expectedAnswers: { items: { s1: { refs: [] } } },
      },
    );

    expect(result.value.requiresReview).toBe(true);
    expect(detail(result, 's1')?.verdict).toBe('noref');
  });

  it('reads a bare list of answers as well as the wrapped one', () => {
    const result = validator.validate({
      submittedAnswer: [
        { itemId: 's1', text: perfect.s1 },
        { itemId: 's2', text: perfect.s2 },
      ],
      expectedAnswers,
      content,
      templateCode: 'translate_to_target',
      checkSettings: {},
      targetLanguage: 'nb',
    });

    expect(result.value.requiresReview).toBe(false);
  });

  it('rejects a submission that is not a list of answers', () => {
    const result = validator.validate({
      submittedAnswer: { accepted_translations: ['Jeg liker katter.'] },
      expectedAnswers,
      content,
      templateCode: 'translate_to_target',
      checkSettings: {},
      targetLanguage: 'nb',
    });

    expect(result.isFail).toBe(true);
    expect(result.error.code).toBe('SCHEMA_MISMATCH');
  });

  it('refuses an exercise with no sentences', () => {
    const result = run({}, { content: { ...content, items: [] } });

    expect(result.isFail).toBe(true);
    expect(result.error.code).toBe('INVALID_EXERCISE');
  });

  it('carries the sentence that was asked, so a diff is read against a question', () => {
    const result = run({ ...perfect, s1: 'Jeg bor i Tromsø i tre år.' });

    // Without the prompt the reviewer sees a diff between two Norwegian sentences and no
    // sign of what the learner was actually given to translate.
    expect(detail(result, 's1')?.prompt).toBe('Я живу в Тромсё уже три года.');
  });

  it('carries the author’s aside to whoever marks the sentence', () => {
    const withNote = {
      items: {
        ...expectedAnswers.items,
        s1: { ...expectedAnswers.items.s1, teacherNote: 'Se på presens perfektum.' },
      },
    };
    const result = run({ ...perfect, s1: 'Jeg bor i Tromsø.' }, { expectedAnswers: withNote });

    expect(detail(result, 's1')?.note).toBe('Se på presens perfektum.');
  });
});
