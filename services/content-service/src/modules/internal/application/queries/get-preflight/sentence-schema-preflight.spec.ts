import { sentenceSchemaViolations } from './sentence-schema-preflight.js';

// What earns this file is how quietly the type fails. A sentence with a word left
// outside the schema has no key, so the student projection drops it: the exercise
// publishes clean and the student is shown fewer sentences than the author wrote, or an
// empty board. Nothing errors, and nobody is told until someone opens the exercise.

const settings = {
  labels: true,
  hints: false,
  counts: false,
  prefill: 'none',
  markEmpty: false,
  perField: true,
  hintAfterMistake: true,
  shuffle: true,
  extras: false,
  order: 'strict',
};

const schema = {
  sub: [
    { id: 'f-sub', short: 'sub', label: 'Subjunksjon', hint: '', optional: false },
    { id: 'f-subj', short: 'n', label: 'Subjekt', hint: '', optional: false },
    { id: 'f-v', short: 'v', label: 'Verbal', hint: '', optional: false },
    { id: 'f-slutt', short: 'N', label: 'Sluttfelt', hint: '', optional: true },
  ],
};

/** A set of one finished sentence: every word placed, a rule written against it. */
function ready() {
  return {
    id: 'ex-1',
    content: {
      title: 'Indirekte tale',
      instruction: 'Bygg om setningen og legg den i skjemaet.',
      presetId: 'blank',
      clauses: ['sub'],
      schema,
      rows: [
        {
          id: 'r1',
          clause: 'sub',
          source: '«Jeg kommer i morgen», sa han.',
          chunks: [
            { id: 'c1', text: 'at' },
            { id: 'c2', text: 'han' },
            { id: 'c3', text: 'kommer' },
            { id: 'c4', text: 'i morgen' },
          ],
          extras: [],
        },
      ],
      settings,
    } as Record<string, unknown>,
    expectedAnswers: {
      rows: {
        r1: {
          text: 'at han kommer i morgen',
          why: 'Subjunksjonen «at» innleder leddsetningen, og verbet står etter subjektet.',
          fields: { c1: 'f-sub', c2: 'f-subj', c3: 'f-v', c4: 'f-slutt' },
          alt: {},
          fb: {},
        },
      },
    } as Record<string, unknown>,
  };
}

/** The key of the only row, for tests that break one thing in it. */
function key(exercise: ReturnType<typeof ready>): Record<string, unknown> {
  return (exercise.expectedAnswers['rows'] as Record<string, Record<string, unknown>>)['r1']!;
}

describe('sentenceSchemaViolations', () => {
  it('passes a set whose sentences are all placed and all explained', () => {
    expect(sentenceSchemaViolations(ready())).toEqual([]);
  });

  it('blocks a sentence with words left outside the schema', () => {
    const exercise = ready();
    key(exercise)['fields'] = { c1: 'f-sub', c2: 'f-subj', c3: null, c4: null };

    const violations = sentenceSchemaViolations(exercise);
    const unplaced = violations.find((v) => v.ruleCode === 'SENTENCESCHEMA_ROW_UNPLACED');

    expect(unplaced?.severity).toBe('blocker');
    expect(unplaced?.detail).toContain('2');
    // And the set is then empty, which is reported in its own right: an exercise where
    // the only sentence is unfinished shows the student nothing at all.
    expect(violations.map((v) => v.ruleCode)).toContain('SENTENCESCHEMA_NO_DELIVERABLE_ROWS');
  });

  it('blocks a sentence with no rule written against it', () => {
    // `row.why` does three jobs — shown on success, the last-resort explanation for a
    // wrong placement, the escalating hint from attempt two. Without it the board can
    // only say "wrong", which is the hole audit 34 §5.4 records against this template.
    const exercise = ready();
    key(exercise)['why'] = '';

    const violation = sentenceSchemaViolations(exercise).find(
      (v) => v.ruleCode === 'SENTENCESCHEMA_ROW_NO_WHY',
    );

    expect(violation?.severity).toBe('blocker');
    expect(violation?.itemId).toBe('ex-1');
  });

  it('reports one violation per rule, however many sentences break it', () => {
    // The builder puts each message on the card it belongs to. A version report doing
    // the same would bury a whole container under one exercise.
    const exercise = ready();
    const rows = exercise.content['rows'] as Array<Record<string, unknown>>;
    rows.push({ ...rows[0]!, id: 'r2' }, { ...rows[0]!, id: 'r3' });
    const answers = exercise.expectedAnswers['rows'] as Record<string, unknown>;
    answers['r2'] = { ...key(exercise), why: '' };
    answers['r3'] = { ...key(exercise), why: '' };

    const noWhy = sentenceSchemaViolations(exercise).filter(
      (v) => v.ruleCode === 'SENTENCESCHEMA_ROW_NO_WHY',
    );

    expect(noWhy).toHaveLength(1);
    expect(noWhy[0]?.detail).toContain('2 sentences');
  });

  it('warns rather than blocks where the sentence still works', () => {
    // A clause type switched off does not break the sentences already written in it —
    // it only means no new sentence can choose it.
    const exercise = ready();
    exercise.content['clauses'] = ['main'];
    (exercise.content['schema'] as Record<string, unknown>)['main'] = schema.sub;

    const violation = sentenceSchemaViolations(exercise).find(
      (v) => v.ruleCode === 'SENTENCESCHEMA_ROW_CLAUSE_OFF',
    );

    expect(violation?.severity).toBe('warning');
  });

  it('says nothing about a document of the old form', () => {
    // Plan 52 §8 Q3 leaves six of the seven exercises this way. They have no rows, no
    // chunks and no `why`; judged by these rules, every one would report three blockers.
    const old = {
      id: 'ex-old',
      content: {
        sentence: 'I morgen skal jeg reise til Bergen.',
        source_sentence: 'Jeg skal reise til Bergen i morgen.',
        schema_type: 'main',
        fields: [{ id: 'forfelt', label: 'Forfelt' }],
        tokens: [{ id: 't1', text: 'I morgen' }],
      },
      expectedAnswers: { placements: [{ field_id: 'forfelt', token_ids: ['t1'] }] },
    };

    expect(sentenceSchemaViolations(old)).toEqual([]);
  });
});
