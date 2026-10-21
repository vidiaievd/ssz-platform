/**
 * Verbatim copies of real template schemas from `content-service/prisma/seed.ts` (comments
 * dropped), so the schema rewrites (Gemini downgrade, OpenAI strict mode) are tested on what
 * the agents will actually send. If a template's schema changes there, refresh it here.
 */

const audioSchema = {
  type: 'object',
  description: 'Listening layer — plan 56. Absent or enabled:false means unchanged.',
  properties: {
    enabled: { type: 'boolean' },
    source: { type: 'string', enum: ['asset', 'link', 'lesson', 'items'] },
    assetId: { type: 'string', description: 'media-service asset, uploaded as exercise_asset' },
    url: { type: 'string', description: 'source=link only; never a pre-signed URL' },
    lessonRef: {
      type: ['object', 'null'],
      description: 'source=lesson: the narration this clip borrows, by reference',
      properties: { lessonId: { type: 'string' }, variant: { type: 'string' } },
    },
    fileName: { type: 'string' },
    title: { type: 'string', description: 'What the student sees above the player' },
    duration: { type: 'number' },
    transcript: { type: 'string' },
    translation: { type: 'string' },
    useSegments: { type: 'boolean' },
    settings: {
      type: 'object',
      properties: {
        layout: { type: 'string', enum: ['top', 'gate'] },
        plays: { type: 'integer', enum: [0, 1, 2, 3], description: '0 = unlimited' },
        seek: { type: 'boolean' },
        speed: { type: 'boolean' },
        gate: { type: 'string', enum: ['none', 'first'] },
        transcriptWhen: { type: 'string', enum: ['never', 'after', 'always'] },
      },
    },
  },
};

const itemAudioSchema = {
  type: 'object',
  description: 'Timecode of this item within the exercise audio (plan 56)',
  required: ['start', 'end'],
  properties: { start: { type: 'number' }, end: { type: 'number' } },
};

const translateGuardSchema = {
  type: 'array',
  items: {
    type: 'object',
    required: ['text'],
    properties: {
      text: { type: 'string' },
      note: { type: 'string' },
    },
  },
};

export const translateContentSchema = {
  type: 'object',
  required: ['items'],
  properties: {
    audio: audioSchema,
    dir: {
      type: 'string',
      enum: ['to_target', 'from_target', 'both'],
      default: 'to_target',
      description: 'Which way the set is translated; "both" is a mixed set',
    },
    langs: {
      type: 'object',
      properties: { explain: { type: 'string' }, target: { type: 'string' } },
    },
    format: { type: 'string', enum: ['single', 'set'] },
    note: { type: 'string', description: 'Context for the student, shown before submitting' },
    items: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'source'],
        properties: {
          audio: itemAudioSchema,
          id: { type: 'string', description: 'Stable; keys this item in expected_answers' },
          dir: {
            type: 'string',
            enum: ['to_target', 'from_target'],
            description: 'Read only when the exercise dir is "both"',
          },
          source: { type: 'string', description: 'The sentence the student reads' },
          hint: { type: 'string' },
          gloss: {
            type: 'array',
            items: {
              type: 'object',
              required: ['w', 't'],
              properties: { w: { type: 'string' }, t: { type: 'string' } },
            },
          },
          mediaId: { type: 'string' },
        },
      },
    },
    check: {
      type: 'object',
      properties: {
        on: { type: 'boolean' },
        caseInsensitive: { type: 'boolean' },
        ignorePunct: { type: 'boolean' },
        foldDiacritics: { type: 'boolean' },
        typo: { type: 'boolean' },
        near: { type: 'number', minimum: 0, maximum: 1 },
        exactPass: { type: 'boolean' },
      },
    },
    flow: {
      type: 'object',
      properties: {
        selfCheck: { type: 'integer', minimum: 0, maximum: 5 },
        attempts: { type: 'string', enum: ['free', 'once'] },
        showRefs: { type: 'string', enum: ['afterGraded', 'afterSubmit', 'never'] },
        keyboard: { type: 'boolean' },
        gloss: { type: 'boolean' },
        charCount: { type: 'boolean' },
        replayLimit: { type: ['integer', 'null'], minimum: 1 },
      },
    },
    ai: {
      type: 'object',
      properties: {
        on: { type: 'boolean' },
        checks: {
          type: 'object',
          properties: {
            grammar: { type: 'boolean' },
            order: { type: 'boolean' },
            lexis: { type: 'boolean' },
            register: { type: 'boolean' },
          },
        },
        visibility: { type: 'string', enum: ['teacher', 'studentBefore', 'studentAfter'] },
      },
    },
  },
};

export const translateAnswerSchema = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'object',
      description: 'Keyed by item id',
      additionalProperties: {
        type: 'object',
        required: ['refs'],
        properties: {
          refs: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Accepted translations, refs[0] first. Inline alternatives: ' +
              '"Jeg (liker|elsker) katter"; "Jeg bor her (nå|)" makes the last word optional',
          },
          require: translateGuardSchema,
          forbid: translateGuardSchema,
          explanation: { type: 'string', description: 'Why the key reads the way it does' },
          teacherNote: { type: 'string', description: 'Only ever shown in the teacher queue' },
        },
      },
    },
  },
};

export const errorCorrectionContentSchema = {
  type: 'object',
  required: ['items'],
  properties: {
    audio: audioSchema,
    items: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'wrong'],
        properties: {
          audio: itemAudioSchema,
          id: { type: 'string', description: 'Stable; keys this item in expected_answers' },
          wrong: { type: 'string', description: 'The sentence the student meets' },
          hint: { type: 'string' },
        },
      },
    },
    mode: { type: 'string', enum: ['sentences', 'passage'] },
    note: { type: 'string' },
    hints: {
      type: 'object',
      properties: {
        count: { type: 'boolean', description: 'How many mistakes there are' },
        mark: { type: 'boolean' },
        hintText: { type: 'boolean' },
        showType: { type: 'boolean' },
      },
    },
    check: {
      type: 'object',
      properties: {
        on: { type: 'boolean' },
        caseInsensitive: { type: 'boolean' },
        ignorePunct: { type: 'boolean' },
        typo: { type: 'boolean' },
        near: { type: 'number', minimum: 0, maximum: 1 },
        exactPass: { type: 'boolean' },
        strayEdits: { type: 'string', enum: ['ignore', 'flag', 'block'] },
        requireAllSpans: { type: 'boolean' },
      },
    },
    flow: {
      type: 'object',
      properties: {
        selfCheck: { type: 'integer', minimum: 0, maximum: 3 },
        attempts: { type: 'string', enum: ['free', 'once'] },
        showRefs: { type: 'string', enum: ['afterGraded', 'afterSubmit', 'never'] },
        keyboard: { type: 'boolean' },
        perSentence: { type: 'boolean' },
        showSpanCount: { type: 'boolean' },
      },
    },
    ai: {
      type: 'object',
      properties: {
        on: { type: 'boolean' },
        checks: {
          type: 'object',
          properties: {
            explainWhy: { type: 'boolean' },
            altFixes: { type: 'boolean' },
            register: { type: 'boolean' },
          },
        },
        visibility: { type: 'string', enum: ['teacher', 'studentBefore', 'studentAfter'] },
      },
    },
  },
};

export const errorCorrectionAnswerSchema = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'object',
      description: 'Keyed by item id',
      additionalProperties: {
        type: 'object',
        required: ['ref'],
        properties: {
          ref: {
            type: 'string',
            description: 'The corrected sentence. Variants: "Jeg (liker|elsker) det"',
          },
          alts: {
            type: 'array',
            items: { type: 'string' },
            description: 'Other whole sentences that are accepted',
          },
          meta: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['form', 'order', 'extra', 'missing', 'spelling', 'function'],
                },
                note: { type: 'string' },
                soft: { type: 'boolean' },
              },
            },
          },
          teacherNote: { type: 'string' },
        },
      },
    },
  },
};

export const writingTaskContentSchema = {
  type: 'object',
  required: ['mode', 'prompt', 'points', 'rubric', 'settings'],
  properties: {
    audio: audioSchema,
    mode: { type: 'string', enum: ['letter', 'essay', 'picture', 'retell', 'free'] },
    instruction: { type: 'string', description: 'One line, student-facing' },
    prompt: { type: 'string', description: 'The situation, not the checklist' },
    source: { type: 'string', description: '`retell` only — the text being retold' },
    image: {
      type: 'object',
      description: '`picture` only',
      properties: {
        assetId: { type: 'string' },
        caption: { type: 'string' },
        alt: { type: 'string' },
      },
    },
    letter: {
      type: 'object',
      description: '`letter` only',
      properties: {
        register: { type: 'string', enum: ['formal', 'informal'] },
        recipient: { type: 'string' },
      },
    },
    points: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'text'],
        properties: {
          id: { type: 'string', description: 'Stable; keys this point in expected_answers' },
          text: { type: 'string' },
          required: {
            type: 'boolean',
            description: 'Optional points do not count towards a pass',
          },
        },
      },
    },
    phrases: {
      type: 'array',
      description: 'Optional sentence openers offered to the student',
      items: { type: 'string' },
    },
    rubric: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id: {
            type: 'string',
            description:
              'Stable; keys this criterion in expected_answers and in an attempt’s marks',
          },
          name: { type: 'string' },
          desc: { type: 'string', description: 'What the criterion is about, teacher-facing' },
          weight: { type: 'integer', enum: [1, 2] },
          metric: {
            type: ['string', 'null'],
            enum: ['points', 'paragraphs', 'language', 'lexis', null],
          },
        },
      },
    },
    settings: {
      type: 'object',
      required: ['minWords', 'maxWords', 'passScore'],
      properties: {
        minWords: {
          type: 'integer',
          description: 'Submit is locked below this; 0 = no minimum',
        },
        maxWords: { type: 'integer', description: '0 = no ceiling' },
        timer: {
          type: 'integer',
          description: 'Minutes, 0 = off; counts down from the first keystroke',
        },
        blockPaste: { type: 'boolean' },
        autosave: { type: 'boolean' },
        showWordCount: { type: 'boolean' },
        showPlan: { type: 'boolean', description: 'Must-cover points as a student checklist' },
        showPhrases: { type: 'boolean' },
        showRubric: { type: 'string', enum: ['always', 'afterGraded', 'never'] },
        showModel: { type: 'string', enum: ['afterGraded', 'never'] },
        passScore: { type: 'integer' },
        aiStage: { type: 'boolean' },
        ai: {
          type: 'object',
          properties: {
            grammar: { type: 'boolean' },
            task: { type: 'boolean' },
            structure: { type: 'boolean' },
            lexis: { type: 'boolean' },
            draft: { type: 'boolean' },
          },
        },
        aiVisibility: { type: 'string', enum: ['teacher', 'studentBefore', 'studentAfter'] },
        aiSelfLimit: { type: 'integer', minimum: 0, maximum: 3 },
        revision: { type: 'string', enum: ['once', 'return', 'drafts'] },
      },
    },
  },
};

export const writingTaskAnswerSchema = {
  type: 'object',
  properties: {
    points: {
      type: 'object',
      description: 'Keyed by point id',
      additionalProperties: {
        type: 'object',
        properties: {
          keywords: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    rubric: {
      type: 'object',
      description: 'Keyed by criterion id',
      additionalProperties: {
        type: 'object',
        properties: {
          levels: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'string' } },
        },
      },
    },
    model: { type: 'string', description: 'Example answer. Recommended, never a blocker.' },
  },
};
