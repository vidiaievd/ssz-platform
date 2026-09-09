import { WritingTaskValidator } from '../../../../src/infrastructure/validation/validators/writing-task.validator.js';

const validator = new WritingTaskValidator();

/** The content column: what a student may see. */
const content = {
  mode: 'letter',
  instruction: 'Skriv et sammenhengende brev.',
  prompt: 'Kommunen vil stenge svømmehallen. Skriv til dem.',
  letter: { register: 'formal', recipient: 'Tromsø kommune' },
  points: [
    { id: 'p1', text: 'Presenter deg selv', required: true },
    { id: 'p2', text: 'Avslutt høflig', required: true },
    { id: 'p3', text: 'Fortell om deg selv', required: false },
  ],
  rubric: [{ id: 'c1', name: 'Oppgaveløsning', desc: '', weight: 2, metric: 'points' }],
  settings: { minWords: 10, maxWords: 40, passScore: 4 },
};

/** The expected_answers column: the key the student never sees. */
const expectedAnswers = {
  points: {
    p1: { keywords: ['jeg heter'] },
    p2: { keywords: ['med vennlig hilsen'] },
    p3: { keywords: ['jeg jobber som'] },
  },
  rubric: { c1: { levels: ['Nei', 'Litt', 'Nesten', 'Ja'] } },
  model: 'Hei, jeg heter Anna…',
};

const run = (submittedAnswer: unknown) =>
  validator.validate({
    submittedAnswer,
    expectedAnswers,
    content,
    checkSettings: {},
    targetLanguage: 'nb',
  });

type Details = {
  totalItems: number;
  passedItems: number;
  wordCount: number;
  paragraphs: number;
  length: string;
  hitCount: number;
  neededCount: number;
  points: Array<{ id: string; hit: boolean; ticked: boolean; required: boolean }>;
};

const FULL =
  'Hei, jeg heter Anna og bor i Kroken.\n\nJeg synes svømmehallen er viktig for barna i bydelen.\n\nMed vennlig hilsen Anna.';

describe('WritingTaskValidator', () => {
  it('routes every submission to a person, however good it is', () => {
    const result = run({ text: FULL, ticked: ['p1', 'p2'] });

    expect(result.isOk).toBe(true);
    expect(result.value.requiresReview).toBe(true);
    expect(result.value.correct).toBe(false);
    // The teacher's marks are the score; a number written here is one they would
    // have to overwrite.
    expect(result.value.score).toBe(0);
  });

  it('measures the text for the queue: words, paragraphs and point coverage', () => {
    const details = run({ text: FULL, ticked: [] }).value.details as Details;

    expect(details.wordCount).toBe(21);
    expect(details.paragraphs).toBe(3);
    expect(details.hitCount).toBe(2);
    // p3 is optional and does not count towards the pass.
    expect(details.neededCount).toBe(2);
    expect(details.length).toBe('ok');
  });

  it('reports the student’s ticks next to what the text actually says', () => {
    // Ticked every point, phrased two: exactly the disagreement the queue exists to show.
    const details = run({ text: FULL, ticked: ['p1', 'p2', 'p3'] }).value.details as Details;

    expect(details.points).toEqual([
      { id: 'p1', text: 'Presenter deg selv', required: true, hit: true, ticked: true },
      { id: 'p2', text: 'Avslutt høflig', required: true, hit: true, ticked: true },
      { id: 'p3', text: 'Fortell om deg selv', required: false, hit: false, ticked: true },
    ]);
  });

  it('counts the submission as one item the machine passed none of', () => {
    const details = run({ text: FULL, ticked: [] }).value.details as Details;

    expect(details.totalItems).toBe(1);
    expect(details.passedItems).toBe(0);
  });

  it('carries no mark suggestions, so nothing downstream can pre-fill a rubric', () => {
    const details = run({ text: FULL, ticked: [] }).value.details as Record<string, unknown>;

    expect(details['suggested']).toBeUndefined();
    expect(details['total']).toBeUndefined();
  });

  it('records a text under the minimum rather than rejecting it', () => {
    // The runner locks the submit button. A short text that arrives anyway is a
    // teacher's decision, not a reason to answer 400 with the work inside it.
    const result = run({ text: 'Hei hei.', ticked: [] });

    expect(result.isOk).toBe(true);
    expect((result.value.details as Details).length).toBe('short');
  });

  it('accepts a submission with no ticks at all', () => {
    const details = run({ text: FULL }).value.details as Details;

    expect(details.points.every((point) => point.ticked === false)).toBe(true);
  });

  it('rejects a submission carrying no text', () => {
    for (const answer of [null, 'Jeg mener at…', { ticked: ['p1'] }, { text: 42 }]) {
      const result = run(answer);
      expect(result.isFail).toBe(true);
      expect(result.error.code).toBe('SCHEMA_MISMATCH');
    }
  });

  it('still routes the text when the exercise itself is malformed', () => {
    // Failing here would throw away the student's work to report the author's bug.
    const result = validator.validate({
      submittedAnswer: { text: FULL },
      expectedAnswers: {},
      content: {},
      checkSettings: {},
      targetLanguage: 'nb',
    });

    expect(result.isOk).toBe(true);
    expect(result.value.requiresReview).toBe(true);
    expect((result.value.details as Details).wordCount).toBe(21);
  });
});
