import { writingTaskViolations } from './writing-task-preflight.js';

// `writing_task` has no auto-check, so pre-flight is the last place a hole in the
// document can be caught by a machine. After publication the next reader is a teacher
// holding a submitted text, and by then the missing rubric is their problem.

const settings = {
  minWords: 120,
  maxWords: 200,
  timer: 0,
  blockPaste: true,
  autosave: true,
  showWordCount: true,
  showPlan: true,
  showPhrases: true,
  showRubric: 'afterGraded',
  showModel: 'afterGraded',
  passScore: 8,
  aiStage: true,
  ai: { grammar: true, task: true, structure: true, lexis: true, draft: true },
  aiVisibility: 'teacher',
  aiSelfLimit: 2,
  revision: 'return',
};

/** A complete letter task: prompt, recipient, two points with phrasings, a full rubric. */
function ready() {
  return {
    id: 'ex-1',
    content: {
      mode: 'letter',
      instruction: 'Skriv et sammenhengende brev.',
      prompt: 'Kommunen vil stenge svømmehallen. Skriv til dem.',
      source: '',
      image: { caption: '', alt: '' },
      letter: { register: 'formal', recipient: 'Tromsø kommune' },
      points: [
        { id: 'p1', text: 'Presenter deg selv', required: true },
        { id: 'p2', text: 'Avslutt høflig', required: true },
      ],
      phrases: [],
      rubric: [
        {
          id: 'c1',
          name: 'Oppgaveløsning',
          desc: 'Er punktene dekket?',
          weight: 2,
          metric: 'points',
        },
        { id: 'c2', name: 'Språk', desc: 'Setningsbygning.', weight: 1, metric: 'language' },
      ],
      settings,
    } as Record<string, unknown>,
    expectedAnswers: {
      points: {
        p1: { keywords: ['jeg heter'] },
        p2: { keywords: ['med vennlig hilsen'] },
      },
      rubric: {
        c1: { levels: ['Svarer ikke', 'Ett punkt', 'De fleste', 'Alle punktene'] },
        c2: { levels: ['Uforståelig', 'Mange feil', 'Noen feil', 'Få feil'] },
      },
      model: 'Hei, jeg heter Anna og skriver til dere fordi…',
    } as Record<string, unknown>,
  };
}

describe('writingTaskViolations', () => {
  it('reports nothing on a finished exercise', () => {
    expect(writingTaskViolations(ready())).toEqual([]);
  });

  it('blocks an empty rubric — a teacher would have nothing to mark against', () => {
    const exercise = ready();
    exercise.content['rubric'] = [];

    expect(writingTaskViolations(exercise)).toContainEqual({
      ruleCode: 'WRITINGTASK_RUBRIC_EMPTY',
      severity: 'blocker',
      itemType: 'EXERCISE',
      itemId: 'ex-1',
      detail: 'The rubric is empty, so a teacher has nothing to mark the text against',
    });
  });

  it('blocks a pass score no text can reach, and says what the maximum is', () => {
    const exercise = ready();
    exercise.content['settings'] = { ...settings, passScore: 12 };

    expect(writingTaskViolations(exercise)).toContainEqual(
      expect.objectContaining({
        ruleCode: 'WRITINGTASK_PASS_SCORE_TOO_HIGH',
        severity: 'blocker',
        // 3 × 2 + 3 × 1.
        detail: 'The pass score is 12 of a possible 9, so no text can pass',
      }),
    );
  });

  it('blocks a retelling with no source text', () => {
    const exercise = ready();
    exercise.content['mode'] = 'retell';

    expect(writingTaskViolations(exercise)).toContainEqual(
      expect.objectContaining({ ruleCode: 'WRITINGTASK_MODE_NO_SOURCE', severity: 'blocker' }),
    );
  });

  it('blocks a picture task with no image asset', () => {
    const exercise = ready();
    exercise.content['mode'] = 'picture';

    expect(writingTaskViolations(exercise)).toContainEqual(
      expect.objectContaining({ ruleCode: 'WRITINGTASK_MODE_NO_IMAGE', severity: 'blocker' }),
    );
  });

  it('warns about a missing example answer without blocking publication', () => {
    const exercise = ready();
    exercise.expectedAnswers['model'] = '';

    const violations = writingTaskViolations(exercise);

    expect(violations).toContainEqual(
      expect.objectContaining({ ruleCode: 'WRITINGTASK_EX_NO_MODEL', severity: 'warning' }),
    );
    expect(violations.filter((v) => v.severity === 'blocker')).toEqual([]);
  });

  it('counts criteria with an empty descriptor into one line, not one line each', () => {
    const exercise = ready();
    exercise.expectedAnswers['rubric'] = {
      c1: { levels: ['Svarer ikke', '', 'De fleste', 'Alle punktene'] },
      c2: { levels: ['', '', '', ''] },
    };

    const empty = writingTaskViolations(exercise).filter(
      (v) => v.ruleCode === 'WRITINGTASK_CRIT_LEVEL_EMPTY',
    );

    expect(empty).toHaveLength(1);
    expect(empty[0]).toMatchObject({
      severity: 'warning',
      detail: '2 criteria have an empty level descriptor, and two teachers will grade differently',
    });
  });

  it('says nothing about the unbuilt AI stage, which has no severity to report under', () => {
    const exercise = ready();
    // Stage off, draft rubric on — `info` in the builder's rail, noise in a version report.
    exercise.content['settings'] = { ...settings, aiStage: false };

    const codes = writingTaskViolations(exercise).map((v) => v.ruleCode);

    expect(codes).not.toContain('WRITINGTASK_AI_STAGE_OFF_DRAFT_ON');
  });

  it('reports a document in the pre-plan-50 shape rather than throwing on it', () => {
    // The old template: a prompt, a topic list and a word range, snake_case throughout.
    const violations = writingTaskViolations({
      id: 'ex-old',
      content: { prompt: 'Skriv om ferien din.', min_words: 120, max_words: 200 },
      expectedAnswers: {},
    });

    expect(violations.map((v) => v.ruleCode)).toEqual(
      expect.arrayContaining([
        'WRITINGTASK_EX_NO_POINTS',
        'WRITINGTASK_RUBRIC_EMPTY',
        'WRITINGTASK_EX_NO_MODEL',
      ]),
    );
  });
});
