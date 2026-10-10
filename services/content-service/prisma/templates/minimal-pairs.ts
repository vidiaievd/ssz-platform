// The `minimal_pairs` exercise template's schemas — kept out of `seed.ts` for the reason
// `dictation.ts` is: a test runs them through AJV without loading the generated Prisma client
// (plan 72 phase 4, item 1).
//
// Listening discrimination: one word of a pair is played and the student picks what they heard
// (plan 72, design handoff 06_design_handoff_minimal_pairs). The document holds the words and
// their clips — which clip is which word *is* the key — so `content` is never served to a
// learner: the projection carries neither, and the engine hands each probe out on its own
// (plan 72 §3.2, §3.6). `expected_answers` holds only the teacher's note per pair. The kernel
// module `@ssz/shared-kernel/minimal-pairs` splits the authored document across the two columns
// and joins it back.
//
// No audio layer: the clips are the document's own, and the spec decides against the shared
// layer (plan 72 §3.13), so unlike `read_aloud` this takes no `audioSchema`.
//
// Ids (pair, word) are the builder's short ids; `-` and `_` are allowed so that an id minted
// elsewhere (a uuid) still fits. Never a `:` — it is the separator of a probe key.
const ID = '^[A-Za-z0-9_-]+$';

export function minimalPairsTemplate() {
  return {
    code: 'minimal_pairs',
    name: 'Minimal pairs',
    description: 'Listen to a word and pick which of two similar-sounding words you heard',
    contentSchema: {
      type: 'object',
      required: ['pairs'],
      properties: {
        title: { type: 'string', description: 'Teacher-facing name of the exercise' },
        // The course language the document was created in — stamped by the scaffold, not
        // edited. It picks the contrast pack; empty means no pack (plan 72 §3.3).
        language: { type: 'string' },
        contrastId: { type: 'string', description: 'The contrast family of the set' },
        instruction: { type: 'string', description: 'Shown above the first probe' },
        // No `minItems`/`maxItems`, although no pairs is a blocker and a pair holds two or three
        // words: this schema is checked on every write, and a document an author is in the
        // middle of must stay saveable. The bounds are reported at publication
        // (`minimal-pairs-preflight.ts`) — the reasoning of the types before it.
        pairs: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', pattern: ID, description: 'Stable; the key of a note' },
              // Empty means the contrast of the exercise.
              contrastId: { type: 'string' },
              words: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id'],
                  properties: {
                    id: { type: 'string', pattern: ID },
                    text: { type: 'string' },
                    gloss: { type: 'string' },
                    ipa: { type: 'string' },
                    // One clip per word: an id and what the kernel checks, never a URL — a
                    // signed link lives an hour and a document lives years (plan 72 §3.1).
                    clip: {
                      type: 'object',
                      properties: {
                        assetId: { type: 'string' },
                        fileName: { type: 'string' },
                        durationMs: { type: 'integer', minimum: 0 },
                        provenance: { type: 'string', enum: ['studio', 'teacher', 'tts'] },
                        voice: { type: 'string' },
                        dialect: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        set: {
          type: 'object',
          properties: {
            // The bounds of the field (2–30) and of the working strip (8–15) are the builder's
            // and the preflight's; the schema only keeps it a count.
            probes: { type: 'integer', minimum: 1 },
            sampling: { type: 'string', enum: ['balanced', 'random', 'weakest'] },
            allowRepeat: { type: 'boolean' },
            maxSameAnswer: { type: 'integer', minimum: 1 },
            options: { type: 'string', enum: ['pair', 'all'] },
            shuffleOptions: { type: 'boolean' },
            // 0 is unlimited.
            playsPerProbe: { type: 'integer', enum: [0, 1, 2, 3] },
            autoplay: { type: 'boolean' },
          },
        },
        feedback: {
          type: 'object',
          properties: {
            immediate: { type: 'boolean' },
            abCompare: { type: 'boolean' },
            showSpelling: { type: 'string', enum: ['always', 'afterAnswer'] },
            showGloss: { type: 'string', enum: ['always', 'afterAnswer', 'never'] },
            showIpa: { type: 'boolean' },
            secondChance: { type: 'boolean' },
          },
        },
        scoring: {
          type: 'object',
          properties: {
            // Never projected to the student; it comes back with the result.
            passPct: { type: 'integer', minimum: 0, maximum: 100 },
            memory: { type: 'string', enum: ['contrast', 'contrast+word', 'none'] },
            logWordExposure: { type: 'boolean' },
            // Sittings allowed; 0 is unlimited (plan 72 Q4).
            attempts: { type: 'integer', enum: [0, 1, 2, 3] },
          },
        },
      },
    },
    // The teacher's note per pair — «never shown to the student». Keyed by pair id, so
    // reordering pairs cannot move a note onto another one.
    answerSchema: {
      type: 'object',
      properties: {
        pairs: {
          type: 'object',
          propertyNames: { pattern: ID },
          additionalProperties: {
            type: 'object',
            properties: { note: { type: 'string' } },
          },
        },
      },
    },
    // Nothing template-wide: the pass mark is `scoring.passPct` on the document, and a
    // `minimal_pairs` is judged by the engine's own validator (plan 72 phase 5).
    defaultCheckSettings: {},
  };
}
