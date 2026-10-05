// The `inflection_table` exercise template's schemas — kept out of `seed.ts` for the reason
// `dictation.ts` is: a test runs them through AJV without loading the generated Prisma client
// (plan 69 phase 3, item 1). `audioSchema` stays defined once in `seed.ts` and is passed in.
//
// A paradigm filled in lemma by lemma (plan 69, design handoff 04_design_handoff_inflection_table).
// A cell is the element — addressed `rowId:slotId`, one verdict, one `itemKey` — and the form of
// an *asked* cell is the key, so it lives in `expected_answers` with its variants and its reason;
// `content` carries the table's shape and the forms that are given. The kernel module
// `@ssz/shared-kernel/inflection-table` is the one place that splits the authored document across
// the two columns and joins it back.
//
// Slot ids are **not** enumerated: the columns are data of the language pack (DECISIONS §1), and a
// schema listing them would have to change with every pack. A slot id is a bare identifier.
const SLOT_ID = '^[A-Za-z]+$';

// `rowId:slotId`. Row ids are the builder's short ids; `-` and `_` are allowed so that an id minted
// elsewhere (a uuid) still fits. Never a `:` inside a part — that is the separator.
const CELL_KEY = '^[A-Za-z0-9_-]+:[A-Za-z]+$';

export function inflectionTableTemplate(audioSchema: object) {
  return {
    code: 'inflection_table',
    name: 'Inflection table',
    description: 'Fill in the forms of a paradigm, lemma by lemma',
    contentSchema: {
      type: 'object',
      required: ['slots', 'rows'],
      properties: {
        // Optional layer, one clip for the whole table (plan 69, deviation 7).
        audio: audioSchema,
        title: { type: 'string', description: 'Teacher-facing name of the exercise' },
        instruction: {
          type: 'string',
          description: 'Shown above the grid, in the target language',
        },
        // The course language the document was created in — stamped by the scaffold, not edited
        // (decision Q2-A of plan 68). It picks the paradigm pack; empty means no pack (Q5-A).
        language: { type: 'string' },
        // Which pack and version the table was authored against (DECISIONS §1). A slot the pack
        // has since dropped is reported at publication (`IT_SLOT_GONE`), not refused here.
        packId: { type: 'string' },
        packVersion: { type: 'string' },
        paradigmId: { type: 'string' },
        // Slots in play, in the pack's order.
        slots: { type: 'array', items: { type: 'string', pattern: SLOT_ID } },
        // No `minItems`/`maxItems`, although no rows is a blocker and more than ten is refused by
        // the builder: this schema is checked on every write, and a table an author is in the
        // middle of must stay saveable. The bounds are reported at publication
        // (`inflection-table-preflight.ts`) — the reasoning of the three types before it.
        rows: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'cells'],
            properties: {
              id: {
                type: 'string',
                pattern: '^[A-Za-z0-9_-]+$',
                description: 'Stable; the first half of every cell key',
              },
              lemma: { type: 'string', description: 'Dictionary form as the student reads it' },
              gloss: { type: 'string', description: 'Meaning, copied from the dictionary' },
              // The course dictionary entry. Not `format: uuid`: seeded vocabulary is uuidv5
              // and a version-pinned check would refuse it (memory `seeded-content-uuid-v5`).
              dictId: { type: ['string', 'null'] },
              // Keyed by slot id. Cells of switched-off slots stay here.
              cells: {
                type: 'object',
                propertyNames: { pattern: SLOT_ID },
                additionalProperties: {
                  type: 'object',
                  required: ['mode'],
                  properties: {
                    mode: { type: 'string', enum: ['prefill', 'ask'] },
                    // Only on a given cell. An asked cell's form is the key and never here.
                    value: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        input: {
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['type', 'bank'] },
            // Distractors in the bank, generated from the pack (decision Q2-A).
            bankExtra: { type: 'integer', minimum: 0, maximum: 5 },
            // Dealt by the server per attempt.
            shuffleRows: { type: 'boolean' },
          },
        },
        settings: {
          type: 'object',
          properties: {
            // Checks of the whole table. Enforced on the attempt, not here.
            attempts: { type: 'integer', minimum: 1, maximum: 4 },
            // Percent of asked cells, over the first check, compared with `>=`. Never projected
            // to the student (plan 69 §3.2).
            threshold: { type: 'number', minimum: 50, maximum: 100 },
            revealKey: { type: 'string', enum: ['afterLast', 'afterFirst', 'never'] },
            // The key's first letter in an empty cell. Lowers the evidence ceiling (Q3-A).
            hintFirstLetter: { type: 'boolean' },
            // Whether the row chip is shown; the row verdict is recorded either way.
            rowVerdict: { type: 'boolean' },
          },
        },
      },
    },
    // The author's key. Not the learner's submission schema: `inflection_table` is in
    // `OWN_SUBMISSION_SHAPE` in exercise-engine, because the key is per cell with variants and
    // reasons while the submission is a form per cell.
    answerSchema: {
      type: 'object',
      required: ['cells'],
      properties: {
        // Keyed by `rowId:slotId`, so reordering rows cannot move a key onto another cell.
        cells: {
          type: 'object',
          propertyNames: { pattern: CELL_KEY },
          additionalProperties: {
            type: 'object',
            properties: {
              // The form of an asked cell. Absent for a given one, whose form is content.
              value: { type: 'string' },
              // Variants accepted in this cell only (DECISIONS «per cell»).
              accept: { type: 'array', items: { type: 'string' } },
              // Why this form and not another; required at publication (DECISIONS §3).
              why: { type: 'string' },
            },
          },
        },
      },
    },
    // Nothing template-wide: the pass mark is `settings.threshold` on the document, and the whole
    // table checked at once is the type's only mode (plan 69 §3.4).
    defaultCheckSettings: {},
  };
}
