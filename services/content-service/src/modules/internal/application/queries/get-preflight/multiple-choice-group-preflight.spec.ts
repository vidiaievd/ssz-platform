import { multipleChoiceGroupViolations } from './multiple-choice-group-preflight.js';

// What earns this file is that an unfinished statement does not fail loudly — it
// disappears. The projection decides which rows a student sees by asking the key column
// whether each one is marked, so a row nobody marked is dropped, and the table publishes
// clean with fewer statements than the author wrote. `EX_TOO_FEW_READY` is the end of the
// same road: a table where nothing was marked projects as an empty exercise.

const settings = {
  numbering: true,
  shuffleRows: false,
  layout: 'auto',
  showText: true,
  retry: 'one',
  lockCorrect: true,
  showWhy: 'wrong',
  revealKey: true,
  passThreshold: 70,
  progress: true,
};

/** A finished table: a passage, two columns and three marked, explained statements. */
function ready() {
  return {
    id: 'ex-1',
    language: 'nb',
    content: {
      title: 'Tekst 1A',
      instruction: 'Er påstandene riktige eller gale?',
      source: {
        mode: 'inline',
        label: 'Bartek søker ny jobb',
        text: 'Bartek er snekker. Han har jobbet i tre år. Han søker en ny jobb i Bergen.',
      },
      columns: [
        { id: 'c1', label: 'Riktig', short: 'R' },
        { id: 'c2', label: 'Galt', short: 'G' },
      ],
      rows: [
        { id: 'r1', text: 'Bartek er snekker.' },
        { id: 'r2', text: 'Bartek søker jobb i Oslo.' },
        { id: 'r3', text: 'Bartek har jobbet i tre år.' },
      ],
      settings,
    },
    expectedAnswers: {
      rows: {
        r1: { answer: 'c1', why: 'Teksten sier det i første setning.', quote: 'Bartek er snekker.' },
        r2: { answer: 'c2', why: 'Han søker i Bergen, ikke i Oslo.', quote: 'Han søker en ny jobb i Bergen.' },
        r3: { answer: 'c1', why: 'Teksten sier tre år.', quote: 'Han har jobbet i tre år.' },
      },
    },
  };
}

const codes = (exercise: ReturnType<typeof ready>) =>
  multipleChoiceGroupViolations(exercise).map((v) => v.ruleCode);

describe('multipleChoiceGroupViolations', () => {
  it('passes a finished table', () => {
    expect(multipleChoiceGroupViolations(ready())).toEqual([]);
  });

  it('blocks a statement with no column marked, and says it would be dropped', () => {
    const exercise = ready();
    exercise.expectedAnswers.rows.r2.answer = null as unknown as string;

    const violation = multipleChoiceGroupViolations(exercise).find(
      (v) => v.ruleCode === 'MULTIPLECHOICEGROUP_ROW_NO_ANSWER',
    );
    expect(violation).toMatchObject({ severity: 'blocker', itemType: 'EXERCISE', itemId: 'ex-1' });
    expect(violation?.detail).toContain('dropped');
  });

  it('blocks a table where fewer than two statements would reach the student', () => {
    const exercise = ready();
    exercise.expectedAnswers.rows.r2.answer = null as unknown as string;
    exercise.expectedAnswers.rows.r3.answer = null as unknown as string;

    expect(codes(exercise)).toContain('MULTIPLECHOICEGROUP_EX_TOO_FEW_READY');
  });

  it('blocks an untouched document, whatever the builder rail shows', () => {
    // Deviation 5 of plan 54 §5: `stepState` deliberately reports «nothing here yet»
    // rather than an error on a scaffold, so that opening a new exercise does not greet
    // the author with a red badge. That is the rail's judgement and not this one — the
    // scaffold is four blank rows and must not publish.
    const exercise = ready();
    exercise.content.rows = [
      { id: 'r1', text: '' },
      { id: 'r2', text: '' },
    ];
    exercise.expectedAnswers.rows = {} as (typeof exercise.expectedAnswers)['rows'];

    expect(codes(exercise)).toContain('MULTIPLECHOICEGROUP_EX_TOO_FEW_READY');
  });

  it('blocks a column pair the student cannot choose between', () => {
    const exercise = ready();
    exercise.content.columns = [{ id: 'c1', label: 'Riktig', short: 'R' }];

    expect(codes(exercise)).toContain('MULTIPLECHOICEGROUP_COL_TOO_FEW');
  });

  it('blocks an inline passage that was never written', () => {
    const exercise = ready();
    exercise.content.source.text = '';

    expect(codes(exercise)).toContain('MULTIPLECHOICEGROUP_SOURCE_EMPTY');
  });

  it('blocks explanations switched on with none written', () => {
    const exercise = ready();
    for (const key of Object.values(exercise.expectedAnswers.rows)) key.why = '';

    expect(codes(exercise)).toContain('MULTIPLECHOICEGROUP_NO_EXPLANATIONS');
  });

  it('warns rather than blocks when only some statements are explained', () => {
    const exercise = ready();
    exercise.expectedAnswers.rows.r3.why = '';

    const violation = multipleChoiceGroupViolations(exercise).find(
      (v) => v.ruleCode === 'MULTIPLECHOICEGROUP_ROW_NO_WHY',
    );
    expect(violation?.severity).toBe('warning');
  });

  it('counts a repeated code once and names the count in the detail', () => {
    const exercise = ready();
    exercise.expectedAnswers.rows.r2.why = '';
    exercise.expectedAnswers.rows.r3.why = '';

    const found = multipleChoiceGroupViolations(exercise).filter(
      (v) => v.ruleCode === 'MULTIPLECHOICEGROUP_ROW_NO_WHY',
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.detail).toContain('2 statements');
  });

  it('drops info-level findings — a three-row table is a nudge, not a report line', () => {
    // `EX_FEW_ROWS` fires on the finished fixture: three ready statements is fewer than
    // four. It belongs on the row the author is writing, not in a container report.
    expect(codes(ready()).some((c) => c.includes('FEW_ROWS'))).toBe(false);
  });

  it('skips a document of the old form rather than reporting it broken', () => {
    const old = {
      id: 'ex-2',
      language: 'nb',
      content: {
        context: 'Tekst 1A',
        options: [
          { id: 'r', text: 'Riktig' },
          { id: 'g', text: 'Galt' },
        ],
        items: [{ id: '1', question: 'Bartek er snekker.' }],
      },
      expectedAnswers: { items: [{ id: '1', correct_option_ids: ['r'] }] },
    };

    expect(multipleChoiceGroupViolations(old)).toEqual([]);
  });
});
