// The `read_aloud` exercise template's schemas — kept out of `seed.ts` for the reason
// `dictation.ts` is: a test runs them through AJV without loading the generated Prisma client
// (plan 70 phase 4, item 1). `audioSchema` stays defined once in `seed.ts` and is passed in.
//
// A passage, a picture with a plan or a line of dialogue spoken aloud and recorded (plan 70,
// design handoff 05_design_handoff_read_aloud). The student's answer is a recording per prompt,
// checked by a person, so the key is not a string to compare against: it is the listening note,
// the focus words and the four level descriptors of each criterion — things the teacher reads
// while listening. They live in `expected_answers`; `content` carries what the student sees and
// the numbers the recorder runs on. The kernel module `@ssz/shared-kernel/read-aloud` is the one
// place that splits the authored document across the two columns and joins it back.
//
// Ids (prompt, criterion, plan point, focus word) are the builder's short ids; `-` and `_` are
// allowed so that an id minted elsewhere (a uuid) still fits. Never a `:` — it is the separator
// of a mark key (`promptId:criterionId`, plan 70 §3.6).
const ID = '^[A-Za-z0-9_-]+$';

export function readAloudTemplate(audioSchema: object) {
  return {
    code: 'read_aloud',
    name: 'Read aloud',
    description: 'Record your voice: read a passage, describe a picture or reply in a dialogue',
    contentSchema: {
      type: 'object',
      required: ['mode', 'prompts', 'rubric'],
      properties: {
        // Optional layer: the model reading (`read`) or the partner's line (`dialogue`).
        audio: audioSchema,
        title: { type: 'string', description: 'Teacher-facing name of the exercise' },
        instruction: { type: 'string', description: 'Shown above the recorder' },
        // The course language the document was created in — stamped by the scaffold, not
        // edited. It picks the default rubric pack; empty means no pack (plan 70 §3.1).
        language: { type: 'string' },
        mode: { type: 'string', enum: ['read', 'monologue', 'dialogue'] },
        // No `minItems`/`maxItems`, although no prompts is a blocker and more than six is
        // refused by the builder: this schema is checked on every write, and a document an
        // author is in the middle of must stay saveable. The bounds are reported at
        // publication (`read-aloud-preflight.ts`) — the reasoning of the types before it.
        prompts: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', pattern: ID, description: 'Stable; the key of a mark' },
              label: { type: 'string' },
              // The material of every mode is kept (a mode switch erases nothing); the
              // projection and the rules read the current mode's alone.
              text: { type: 'string' },
              image: {
                type: 'object',
                properties: {
                  assetId: { type: 'string' },
                  caption: { type: 'string' },
                  alt: { type: 'string' },
                },
              },
              plan: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id'],
                  properties: {
                    id: { type: 'string', pattern: ID },
                    text: { type: 'string' },
                    required: { type: 'boolean' },
                  },
                },
              },
              turn: {
                type: 'object',
                properties: { situation: { type: 'string' }, partner: { type: 'string' } },
              },
              // No ceiling on `maxSeconds`: a value past 180 s is the builder's blocker
              // (`RA_OVER_CEILING`), reported at publication, not refused on a keystroke.
              minSeconds: { type: 'integer', minimum: 0 },
              maxSeconds: { type: 'integer', minimum: 0 },
              prepSeconds: { type: 'integer', minimum: 0, maximum: 120 },
            },
          },
        },
        rubric: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', pattern: ID },
              name: { type: 'string' },
              desc: { type: 'string' },
              weight: { type: 'integer', enum: [1, 2] },
              // Whether the student sees the criterion before the verdict (`showRubric`).
              studentVisible: { type: 'boolean' },
            },
          },
        },
        recording: {
          type: 'object',
          properties: {
            takes: { type: 'integer', minimum: 1, maximum: 3 },
            chooseBest: { type: 'boolean' },
            listenBack: { type: 'boolean' },
            countdown: { type: 'boolean' },
            micCheck: { type: 'boolean' },
            // Whether the discarded takes reach the teacher too (DECISIONS §1).
            keepAllTakes: { type: 'boolean' },
          },
        },
        settings: {
          type: 'object',
          properties: {
            // Rubric points a prompt needs to be passed. Never projected to the student.
            passScore: { type: 'integer', minimum: 0 },
            showRubric: { type: 'string', enum: ['always', 'afterGraded', 'never'] },
            showModel: { type: 'string', enum: ['afterGraded', 'never'] },
            revision: { type: 'string', enum: ['once', 'return'] },
          },
        },
        // The AI stage is configuration only: it is not live (plan 70 deviation 12).
        review: {
          type: 'object',
          properties: {
            aiStage: { type: 'boolean' },
            ai: {
              type: 'object',
              properties: {
                transcript: { type: 'boolean' },
                pronunciation: { type: 'boolean' },
                fluency: { type: 'boolean' },
                draft: { type: 'boolean' },
              },
            },
            aiVisibility: { type: 'string', enum: ['teacher', 'studentAfter'] },
          },
        },
      },
    },
    // The author's key. Not the learner's submission schema: `read_aloud` is in
    // `OWN_SUBMISSION_SHAPE` in exercise-engine, because the submission is a recording per
    // prompt and the key is what the teacher listens for.
    answerSchema: {
      type: 'object',
      properties: {
        // Keyed by prompt id, so reordering prompts cannot move a note onto another one.
        prompts: {
          type: 'object',
          propertyNames: { pattern: ID },
          additionalProperties: {
            type: 'object',
            properties: {
              // What to listen for. A blocker when empty (`RA_NO_NOTE`): a grader told nothing.
              note: { type: 'string' },
              // Words of the passage to listen to; the student sees them only in the feedback.
              focus: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'word'],
                  properties: {
                    id: { type: 'string', pattern: ID },
                    word: { type: 'string' },
                    note: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        // Keyed by criterion id: the four level descriptors, lowest first.
        rubric: {
          type: 'object',
          propertyNames: { pattern: ID },
          additionalProperties: {
            type: 'object',
            properties: {
              levels: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
            },
          },
        },
      },
    },
    // Nothing template-wide: the pass mark is `settings.passScore` on the document, and a
    // verdict per prompt by a person is the type's only mode (plan 70 §3.6).
    defaultCheckSettings: {},
  };
}
