import { shortAnswerViolations } from './short-answer-preflight.js';

// The check that earns this file is `Q_MODEL_FAILS_KEY`: the author's own answer run
// through the author's own key. A key that matches nothing does not error — it marks
// every correct answer as covering none of the points, and the first person to notice
// is a student being told they were wrong.

const settings = {
  passRule: 'all',
  passN: 2,
  typos: true,
  caseless: true,
  minWords: 3,
  showBreakdown: true,
  showModel: 'onClose',
  aiStage: false,
  aiGrammar: true,
  teacherReview: 'flagged',
  progress: true,
};

/** A complete set: one reading question, a passage, a key its model answer passes. */
function ready() {
  return {
    id: 'ex-1',
    content: {
      title: 'Leseforståelse — sykkelregler',
      instruction: 'Svar med egne ord.',
      questions: [
        {
          id: 'q1',
          kind: 'reading',
          passage: 'Fra 1. januar må alle som sykler i mørket ha lys foran og bak.',
          prompt: 'Hva er nytt fra 1. januar?',
        },
      ],
      settings,
    } as Record<string, unknown>,
    expectedAnswers: {
      questions: {
        q1: {
          elements: [
            {
              id: 'e1',
              label: 'Kravet om lys',
              anchors: ['lys foran', 'foran og bak'],
              required: true,
            },
          ],
          model: 'Alle syklister må ha lys foran og bak i mørket.',
          why: 'Regelen står i første setning.',
        },
      },
    } as Record<string, unknown>,
  };
}

const codes = (violations: { ruleCode: string }[]) => violations.map((v) => v.ruleCode);

describe('shortAnswerViolations', () => {
  it('passes a complete exercise', () => {
    expect(shortAnswerViolations(ready())).toEqual([]);
  });

  it('blocks a key its own model answer does not pass, and says by how much', () => {
    const exercise = ready();
    const key = exercise.expectedAnswers as {
      questions: Record<string, { elements: Array<{ anchors: string[] }> }>;
    };
    key.questions['q1'].elements[0].anchors = ['refleksvest'];

    const violations = shortAnswerViolations(exercise);
    expect(violations).toContainEqual(
      expect.objectContaining({
        ruleCode: 'SHORTANSWER_Q_MODEL_FAILS_KEY',
        severity: 'blocker',
        itemType: 'EXERCISE',
        itemId: 'ex-1',
      }),
    );
    expect(
      violations.find((v) => v.ruleCode === 'SHORTANSWER_Q_MODEL_FAILS_KEY')?.detail,
    ).toContain('covers 0 of 1');
  });

  it('blocks a question with no key at all', () => {
    const exercise = ready();
    (exercise.expectedAnswers as { questions: Record<string, unknown> }).questions = {};

    expect(codes(shortAnswerViolations(exercise))).toContain('SHORTANSWER_Q_NO_KEY');
  });

  it('blocks a question with no model answer or no explanation', () => {
    const exercise = ready();
    const key = exercise.expectedAnswers as {
      questions: Record<string, { model: string; why: string }>;
    };
    key.questions['q1'].model = '';
    key.questions['q1'].why = '';

    const reported = codes(shortAnswerViolations(exercise));
    expect(reported).toContain('SHORTANSWER_Q_NO_MODEL');
    expect(reported).toContain('SHORTANSWER_Q_NO_WHY');
  });

  it('warns rather than blocks when a reading question has no passage', () => {
    const exercise = ready();
    (exercise.content as { questions: Array<{ passage: string }> }).questions[0].passage = '';

    const violations = shortAnswerViolations(exercise);
    expect(violations).toContainEqual(
      expect.objectContaining({ ruleCode: 'SHORTANSWER_Q_NO_PASSAGE', severity: 'warning' }),
    );
  });

  it('reports one line per code however many questions share the problem', () => {
    const exercise = ready();
    const content = exercise.content as { questions: Array<Record<string, unknown>> };
    content.questions = [
      { id: 'q1', kind: 'opinion', passage: '', prompt: '' },
      { id: 'q2', kind: 'opinion', passage: '', prompt: '' },
      { id: 'q3', kind: 'opinion', passage: '', prompt: '' },
    ];

    const prompts = shortAnswerViolations(exercise).filter(
      (v) => v.ruleCode === 'SHORTANSWER_Q_NO_PROMPT',
    );
    expect(prompts).toHaveLength(1);
    expect(prompts[0].detail).toBe('3 questions have no text');
  });

  it('drops the info-level audit notes — a report has two severities', () => {
    const exercise = ready();
    const key = exercise.expectedAnswers as {
      questions: Record<string, { elements: Array<{ anchors: string[] }> }>;
    };
    // One anchor, three characters: both an EL_ONE_ANCHOR and an EL_ANCHOR_TOO_SHORT.
    key.questions['q1'].elements[0].anchors = ['lys'];

    const reported = codes(shortAnswerViolations(exercise));
    expect(reported).not.toContain('SHORTANSWER_EL_ONE_ANCHOR');
    expect(reported).not.toContain('SHORTANSWER_EL_ANCHOR_TOO_SHORT');
  });

  it('says nothing about a document of the old form', () => {
    // Plan 51 §8 Q1: 144 of these are live and have none of the fields these rules ask
    // about. Judging one would report four blockers on an exercise that works.
    expect(
      shortAnswerViolations({
        id: 'ex-old',
        content: { question: 'Hvorfor trenger de egenkapital?', context: 'Tekst 3A.' },
        expectedAnswers: { accepted_answers: ['De må ha egenkapital for å få lån.'] },
      }),
    ).toEqual([]);
  });
});
