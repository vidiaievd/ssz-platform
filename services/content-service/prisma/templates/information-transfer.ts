// The `information_transfer` exercise template's schemas — kept out of `seed.ts` for the reason
// `dictation.ts` is: a test runs them through AJV without loading the generated Prisma client
// (plan 73 phase 3, item 1). `audioSchema` and `itemAudioSchema` stay defined once in `seed.ts`
// and are passed in.
//
// A blank filled in from a text or a recording (plan 73, design handoff
// 07_design_handoff_information_transfer). A field is the element — one verdict, one `itemKey`
// (its id) — and its expected wordings are the key, so they live in `expected_answers` with the
// explanation; `content` carries the blank's shape, the source and the settings. The kernel module
// `@ssz/shared-kernel/information-transfer` is the one place that splits the authored document
// across the two columns and joins it back.
//
// Field ids are the builder's short ids; `-` and `_` are allowed so that an id minted elsewhere
// (a uuid) still fits. Never a `:` — it is the separator of an item key.
const ID = '^[A-Za-z0-9_-]+$';

export function informationTransferTemplate(audioSchema: object, itemAudioSchema: object) {
  return {
    code: 'information_transfer',
    name: 'Information transfer',
    description: 'Fill in a form from a text or a recording',
    contentSchema: {
      type: 'object',
      required: ['fields'],
      properties: {
        // The layer's block. `enabled` is written from `sourceKind` by the kernel (plan 73 §3.1),
        // so the block survives a switch to a text source and back.
        audio: audioSchema,
        title: { type: 'string', description: 'Teacher-facing name of the exercise' },
        instruction: { type: 'string', description: 'Shown above the blank' },
        // The course language the document was created in — stamped by the scaffold, not edited.
        // It picks the format pack; empty or unknown means no pack (plan 73 Q2-A).
        language: { type: 'string' },
        sourceKind: { type: 'string', enum: ['text', 'audio'] },
        focus: { type: 'string', enum: ['pragmatics', 'vocabulary'] },
        passageTitle: { type: 'string' },
        passage: { type: 'string' },
        form: {
          type: 'object',
          properties: {
            formTitle: { type: 'string' },
            layout: { type: 'string', enum: ['form', 'table'] },
          },
        },
        // No `minItems`/`maxItems`, although no fields is a blocker and the working strip is 3–8:
        // this schema is checked on every write, and a blank an author is in the middle of must
        // stay saveable. The bounds are reported at publication
        // (`information-transfer-preflight.ts`) — the reasoning of the types before it.
        fields: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id'],
            properties: {
              id: {
                type: 'string',
                pattern: ID,
                description: 'Stable; the itemKey and the key of the answer',
              },
              label: { type: 'string' },
              hint: { type: 'string' },
              type: {
                type: 'string',
                enum: ['time', 'date', 'number', 'money', 'phone', 'name', 'word'],
              },
              unit: { type: 'string' },
              required: { type: 'boolean' },
              // The layer's per-item timecode — the slice of the clip this field is heard in.
              audio: itemAudioSchema,
            },
          },
        },
        grading: {
          type: 'object',
          properties: {
            spelledNumbers: { type: 'boolean' },
            typos: { type: 'boolean' },
            strictCase: { type: 'boolean' },
            requiredAll: { type: 'boolean' },
          },
        },
        answering: {
          type: 'object',
          properties: {
            showSource: { type: 'string', enum: ['always', 'afterAnswer'] },
            oneAtATime: { type: 'boolean' },
            // 0 = the hints are printed on the blank, 1 = after the first check, 9 = never.
            hintsAfter: { type: 'integer', enum: [0, 1, 9] },
            revealKey: { type: 'string', enum: ['immediately', 'afterLastAttempt', 'never'] },
            // Checks of the whole blank; 0 is unlimited.
            attempts: { type: 'integer', enum: [0, 1, 2, 3] },
          },
        },
        scoring: {
          type: 'object',
          properties: {
            // Never projected to the student; it comes back with the result.
            passPct: { type: 'integer', minimum: 0, maximum: 100 },
            memory: { type: 'string', enum: ['skill', 'skill+words', 'none'] },
            logWordExposure: { type: 'boolean' },
          },
        },
      },
    },
    // Per field, by id: what counts as right and why. Never shown before a verdict.
    answerSchema: {
      type: 'object',
      properties: {
        fields: {
          type: 'object',
          propertyNames: { pattern: ID },
          additionalProperties: {
            type: 'object',
            properties: {
              expected: { type: 'array', items: { type: 'string' } },
              why: { type: 'string' },
            },
          },
        },
      },
    },
    // Nothing template-wide: the pass mark is `scoring.passPct` on the document, and an
    // `information_transfer` is judged by the engine's own validator (plan 73 phase 4).
    defaultCheckSettings: {},
  };
}
