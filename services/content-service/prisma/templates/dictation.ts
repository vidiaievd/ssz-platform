// The `dictation` exercise template's schemas — split out of `seed.ts` so a test can run
// them through AJV without pulling in the generated Prisma client, which `seed.ts` imports
// at module scope (plan 68 phase 3, item 4). `audioSchema` and `itemAudioSchema` stay
// defined once in `seed.ts`, shared by every audio-capable template, and are passed in
// rather than duplicated here.
//
// One recording, said sentence by sentence; the student writes what is heard (plan 68,
// design handoff 03_design_handoff_dictation). A sentence is the element — one segment, one
// field, one verdict, one `itemKey` — and the sentence itself is the key, so it lives in
// `expected_answers` along with its reason and its focus words; the content below carries
// only which sentences exist. The kernel module `@ssz/shared-kernel/dictation` is the one
// place that splits the authored document across the two columns and joins it back.
export function dictationTemplate(audioSchema: object, itemAudioSchema: object) {
  return {
    code: 'dictation',
    name: 'Dictation',
    description: 'Listen and write what is said, sentence by sentence',
    contentSchema: {
      type: 'object',
      required: ['segments'],
      properties: {
        // Always on — "audio is on and cannot be turned off" (README). A dictation
        // without a recording is a copying exercise.
        audio: audioSchema,
        title: { type: 'string', description: 'Teacher-facing name of the exercise' },
        instruction: { type: 'string', description: 'Standing instruction above the field' },
        // `segments`: one field per sentence (the default). `whole`: one field for the
        // whole clip — exactly one segment then (AC-B10).
        mode: { type: 'string', enum: ['segments', 'whole'] },
        // The course language the document was created in — stamped by the scaffold, not
        // edited in the builder (decision Q2-A of plan 68). It is the language pack that
        // classifies errors (diacritic vs. typo); an empty string means no pack, and
        // nothing folds.
        language: { type: 'string' },
        // No `minItems` and no `maxItems`, although none is a blocker and more than eight
        // is a warning: this schema is checked on every write, and a document an author is
        // in the middle of must stay saveable. The bounds are reported at publication
        // (`dictation-preflight.ts`) — the reasoning of `sort_into_buckets`' buckets and
        // `highlight_in_text`'s questions.
        segments: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', description: 'Stable; also the itemKey for addressing' },
              // The layer's per-item timecode — the slice of the clip this sentence is.
              // Absent while `mode: 'whole'`, where there is nothing to slice.
              audio: itemAudioSchema,
            },
          },
        },
        // What counts as an error. No control in the builder for `extraCost` — stored, not
        // edited (DECISIONS §4).
        marking: {
          type: 'object',
          properties: {
            caseSensitive: { type: 'boolean' },
            punctuation: { type: 'boolean' },
            // strict/flag: a near miss earns nothing, reported as a mistake or a slip of
            // the hand. half: a near miss earns half a word.
            near: { type: 'string', enum: ['strict', 'flag', 'half'] },
            extraCost: { type: 'number', minimum: 0, maximum: 2 },
          },
        },
        settings: {
          type: 'object',
          properties: {
            // Checks per sentence; 0 = unlimited. Enforced on the attempt, not here.
            attempts: { type: 'integer', enum: [0, 1, 2, 3] },
            // Percent per sentence, over its first check, compared with `>=`. Never
            // projected to the student (plan 68 §3.2).
            threshold: { type: 'number', minimum: 0, maximum: 100 },
            // A counter above the field. Lowers the evidence ceiling while on
            // (DECISIONS §6).
            showWordCount: { type: 'boolean' },
            revealKey: { type: 'boolean', description: 'Whether the key may be shown' },
            hints: { type: 'boolean', description: 'segment.why under a failed check' },
          },
        },
      },
    },
    // The author's key. Not the learner's submission schema: `dictation` is in
    // `OWN_SUBMISSION_SHAPE` in exercise-engine, because the key is a sentence per segment
    // while the submission is one segment's typed text.
    answerSchema: {
      type: 'object',
      required: ['segments'],
      properties: {
        // Keyed by segment id, so reordering the segments cannot move a sentence onto
        // another one.
        segments: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              // Exactly what is said, written as it should be written. Never sent to the
              // student before a verdict.
              text: { type: 'string' },
              // What to say when the sentence comes back wrong; required at publication.
              why: { type: 'string' },
              // Words the dictation is about — reported by name, never «almost right».
              focus: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'wordIndex'],
                  properties: {
                    id: { type: 'string' },
                    // Index into the sentence's own token list. Moves with an edit
                    // (`reanchor.ts`); never a positional guess by the client.
                    wordIndex: { type: 'integer', minimum: 0 },
                    why: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        // Focus words whose surface vanished from their sentence in an edit, waiting for
        // the author to put them back or drop them. Any of them blocks publication
        // (`DICT_*` orphan handling is the builder's; the server's own check is elsewhere
        // in `dictation-preflight.ts`).
        orphans: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'segmentId'],
            properties: {
              id: { type: 'string' },
              segmentId: { type: 'string', description: 'The sentence the word belonged to' },
              surface: { type: 'string', description: 'The word as it was written' },
              why: { type: 'string' },
            },
          },
        },
      },
    },
    // Nothing template-wide: the pass mark is `settings.threshold` on the document, and
    // grading by segment is the type's only mode (plan 68 §3.4).
    defaultCheckSettings: {},
  };
}
