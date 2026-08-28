import { multipleChoiceViolations } from './multiple-choice-preflight.js';

// What earns this file is that the key is not in the content at all. A question with no
// correct option marked still projects, still renders, and marks every pick wrong — and
// the first person to find out is a student. The same goes for a missing `why`: the set
// publishes clean and can only ever say «not right», which is the hole this whole rewrite
// exists to close.

const settings = {
  letters: true,
  layout: 'list',
  shuffle: true,
  shuffleQuestions: false,
  instant: false,
  retry: 'one',
  eliminate: false,
  showWhyWrong: true,
  explainOnCorrect: true,
  progress: true,
};

/** A set of one finished question: a stem, three options, a key, a rule and a rebuttal. */
function ready() {
  return {
    id: 'ex-1',
    language: 'nb',
    content: {
      title: 'Indirekte tale',
      instruction: 'Velg riktig form.',
      questions: [
        {
          id: 'q1',
          kind: 'grammar',
          context: '',
          stem: 'Han sa at han ___ sliten.',
          options: [
            { id: 'o1', text: 'var', fixed: false },
            { id: 'o2', text: 'er', fixed: false },
            { id: 'o3', text: 'har vært', fixed: false },
          ],
        },
      ],
      settings,
    },
    expectedAnswers: {
      questions: {
        q1: {
          correctOptionId: 'o1',
          why: 'Etter «sa at» flyttes presens til preteritum.',
          options: { o2: 'Presens holder seg ikke etter et preteritum.' },
        },
      },
    },
  };
}

const codes = (exercise: ReturnType<typeof ready>) =>
  multipleChoiceViolations(exercise).map((v) => v.ruleCode);

describe('multipleChoiceViolations', () => {
  it('passes a finished set', () => {
    expect(multipleChoiceViolations(ready())).toEqual([]);
  });

  it('blocks a question with no correct option marked', () => {
    const exercise = ready();
    exercise.expectedAnswers.questions.q1.correctOptionId = '';

    const violation = multipleChoiceViolations(exercise).find(
      (v) => v.ruleCode === 'MULTIPLECHOICE_Q_NO_KEY',
    );

    expect(violation?.severity).toBe('blocker');
    expect(violation?.itemId).toBe('ex-1');
    expect(violation?.detail).toContain('no correct option marked');
  });

  it('blocks a question with no rule written behind the right answer', () => {
    const exercise = ready();
    exercise.expectedAnswers.questions.q1.why = '   ';

    const violation = multipleChoiceViolations(exercise).find(
      (v) => v.ruleCode === 'MULTIPLECHOICE_Q_NO_WHY',
    );

    expect(violation?.severity).toBe('blocker');
    expect(violation?.detail).toContain('can only be told it is wrong');
  });

  it('blocks a set whose questions are all half-written', () => {
    const exercise = ready();
    exercise.content.questions[0]!.stem = '';

    expect(codes(exercise)).toEqual(
      expect.arrayContaining([
        'MULTIPLECHOICE_Q_NO_STEM',
        'MULTIPLECHOICE_EX_NO_ANSWERABLE_QUESTION',
      ]),
    );
  });

  it('counts a code once and names the count in the detail', () => {
    // One line per code, not per question: a report that repeated itself would bury the
    // rest of the container under one exercise.
    const exercise = ready();
    exercise.content.questions.push({
      ...exercise.content.questions[0]!,
      id: 'q2',
    });
    exercise.expectedAnswers.questions.q1.why = '';

    const whyViolations = multipleChoiceViolations(exercise).filter(
      (v) => v.ruleCode === 'MULTIPLECHOICE_Q_NO_WHY',
    );

    expect(whyViolations).toHaveLength(1);
    expect(whyViolations[0]?.detail).toContain('2 questions');
  });

  it('warns rather than blocks on a two-option question', () => {
    // Plan 53 §6.5 / Q6: 118 of the 131 seeded exercises are riktig/galt, and the
    // warning is true of every one of them. It must never stop a publish.
    const exercise = ready();
    exercise.content.questions[0]!.options.pop();

    const violation = multipleChoiceViolations(exercise).find(
      (v) => v.ruleCode === 'MULTIPLECHOICE_Q_TWO_OPTIONS',
    );

    expect(violation?.severity).toBe('warning');
    expect(multipleChoiceViolations(exercise).some((v) => v.severity === 'blocker')).toBe(false);
  });

  it('drops the info-level audit flags', () => {
    // «This distractor is phrased as an absolute» is a nudge on the card the author is
    // writing, and noise in a report about a whole container.
    const exercise = ready();
    exercise.content.questions[0]!.options[1]!.text = 'alltid var';

    expect(codes(exercise)).not.toContain('MULTIPLECHOICE_OPT_ABSOLUTE');
  });

  it('says nothing about a document of the old form', () => {
    // Plan 53 §8 Q2 leaves 121 of them live. They have no `questions`, no per-question
    // `why` and no rebuttals — judging one would report three blockers on an exercise
    // that works.
    expect(
      multipleChoiceViolations({
        id: 'ex-old',
        content: {
          question: 'Han sa at han ___ sliten.',
          options: [
            { id: 'a', text: 'var' },
            { id: 'b', text: 'er' },
          ],
        },
        expectedAnswers: { correct_option_ids: ['a'] },
      }),
    ).toEqual([]);
  });

  it('keeps the language-bound rules silent without a pack for the course language', () => {
    // Plan 53 §3.6 п.5: looking for Norwegian absolutes in Ukrainian text is a false
    // flag that discredits the whole audit.
    const exercise = ready();
    exercise.language = 'uk';
    exercise.content.questions[0]!.options[1]!.text = 'alltid var';

    expect(codes(exercise)).not.toContain('MULTIPLECHOICE_OPT_ABSOLUTE');
  });
});
