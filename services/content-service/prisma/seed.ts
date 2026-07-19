import 'dotenv/config';
import { PrismaClient, Prisma } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: `${process.env.DATABASE_URL}`,
  }),
});

// ─── Exercise Template definitions ────────────────────────────────────────────
// Each template defines the JSON Schema shape for exercise.content and
// exercise.expected_answers. Seeded via upsert so the script is idempotent.

const templates = [
  {
    code: 'multiple_choice',
    name: 'Multiple Choice',
    description: 'Select the correct answer from several options',
    contentSchema: {
      type: 'object',
      required: ['question', 'options'],
      properties: {
        question: { type: 'string' },
        options: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'text'],
            properties: {
              id: { type: 'string' },
              text: { type: 'string' },
            },
          },
          minItems: 2,
          maxItems: 8,
        },
        context: { type: 'string' },
        media_id: { type: 'string' },
      },
    },
    answerSchema: {
      type: 'object',
      required: ['correct_option_ids'],
      properties: {
        // Array to support both single-answer and multi-select variants.
        // Single-answer exercises have exactly one element.
        correct_option_ids: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
        },
        explanation: { type: 'string' },
      },
    },
    defaultCheckSettings: { allow_partial_credit: false },
    supportedLanguages: Prisma.DbNull,
  },
  {
    code: 'fill_in_blank',
    name: 'Fill in the Blank',
    description: 'Complete the sentence by filling in missing word(s)',
    contentSchema: {
      type: 'object',
      required: ['text_with_blanks'],
      properties: {
        text_with_blanks: {
          type: 'string',
          description: 'Use ___N___ for blanks, e.g. "Jeg ___1___ norsk"',
        },
        context: { type: 'string' },
        word_bank: { type: 'array', items: { type: 'string' } },
        media_id: { type: 'string' },
      },
    },
    answerSchema: {
      type: 'object',
      required: ['blanks'],
      properties: {
        blanks: {
          type: 'array',
          items: {
            type: 'object',
            required: ['blank_id', 'accepted_answers'],
            properties: {
              blank_id: { type: 'integer' },
              accepted_answers: {
                type: 'array',
                items: { type: 'string' },
                minItems: 1,
              },
              // Optional teaching aid shown as feedback AFTER checking: why the
              // correct choice fits and why typical wrong choices don't.
              // Purely presentational — never affects scoring. Omitting it keeps
              // the exercise exactly as before (backward compatible).
              rationale: {
                type: 'object',
                properties: {
                  explanation: { type: 'string' },
                  options: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['text', 'verdict'],
                      properties: {
                        // The candidate answer being explained.
                        text: { type: 'string' },
                        // correct    — the accepted answer
                        // acceptable — grammatical but not chosen in this context
                        // wrong      — does not work here
                        verdict: { type: 'string', enum: ['correct', 'acceptable', 'wrong'] },
                        note: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        explanation: { type: 'string' },
      },
    },
    defaultCheckSettings: {
      case_sensitive: false,
      trim_whitespace: true,
      allow_partial_credit: true,
    },
    supportedLanguages: Prisma.DbNull,
  },
  {
    code: 'translate_to_target',
    name: 'Translate to Target Language',
    description: 'Translate a sentence from the explanation language to the target language',
    contentSchema: {
      type: 'object',
      required: ['source_text'],
      properties: {
        source_text: { type: 'string' },
        source_language: { type: 'string' },
        context: { type: 'string' },
        media_id: { type: 'string' },
      },
    },
    answerSchema: {
      type: 'object',
      required: ['accepted_translations'],
      properties: {
        accepted_translations: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
        },
        explanation: { type: 'string' },
      },
    },
    defaultCheckSettings: {
      case_sensitive: false,
      trim_whitespace: true,
      punctuation_sensitive: false,
      allow_partial_credit: false,
    },
    supportedLanguages: Prisma.DbNull,
  },
  {
    code: 'translate_from_target',
    name: 'Translate from Target Language',
    description: 'Translate a sentence from the target language to the explanation language',
    contentSchema: {
      type: 'object',
      required: ['source_text'],
      properties: {
        source_text: { type: 'string' },
        context: { type: 'string' },
        media_id: { type: 'string' },
      },
    },
    answerSchema: {
      type: 'object',
      required: ['accepted_translations'],
      properties: {
        accepted_translations: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
        },
        explanation: { type: 'string' },
      },
    },
    defaultCheckSettings: {
      case_sensitive: false,
      trim_whitespace: true,
      punctuation_sensitive: false,
      allow_partial_credit: false,
    },
    supportedLanguages: Prisma.DbNull,
  },
  {
    code: 'match_pairs',
    name: 'Match Pairs',
    description: 'Match items from two columns',
    contentSchema: {
      type: 'object',
      required: ['left_items', 'right_items'],
      properties: {
        left_items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'text'],
            properties: {
              id: { type: 'string' },
              text: { type: 'string' },
            },
          },
          minItems: 2,
        },
        right_items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'text'],
            properties: {
              id: { type: 'string' },
              text: { type: 'string' },
            },
          },
          minItems: 2,
        },
        context: { type: 'string' },
      },
    },
    answerSchema: {
      type: 'object',
      required: ['pairs'],
      properties: {
        pairs: {
          type: 'array',
          items: {
            type: 'object',
            required: ['left_id', 'right_id'],
            properties: {
              left_id: { type: 'string' },
              right_id: { type: 'string' },
            },
          },
        },
        explanation: { type: 'string' },
      },
    },
    defaultCheckSettings: { allow_partial_credit: true },
    supportedLanguages: Prisma.DbNull,
  },
  {
    code: 'short_answer',
    name: 'Short Answer',
    description: 'Answer an open comprehension question in a few words or sentences',
    contentSchema: {
      type: 'object',
      required: ['question'],
      properties: {
        question: { type: 'string' },
        // Optional passage or hint shown alongside the question.
        context: { type: 'string' },
        media_id: { type: 'string' },
        // Optional soft length guidance for the UI (characters).
        max_length: { type: 'integer' },
      },
    },
    answerSchema: {
      type: 'object',
      required: ['reference_answer'],
      properties: {
        // Model answer — revealed after submission and used as grading reference.
        reference_answer: { type: 'string' },
        // Optional exact-match shortcuts for instant auto-grading.
        accepted_answers: { type: 'array', items: { type: 'string' } },
        // Optional grading guidance for LLM / teacher review.
        rubric: { type: 'string' },
        explanation: { type: 'string' },
      },
    },
    defaultCheckSettings: { case_sensitive: false, trim_whitespace: true },
    supportedLanguages: Prisma.DbNull,
  },
  {
    code: 'writing_task',
    name: 'Writing Task',
    description: 'Write a longer free-form text (essay / reader letter); always routed for review',
    contentSchema: {
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: { type: 'string' },
        // Optional "choose one topic" list.
        options: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'title'],
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              body: { type: 'string' },
            },
          },
        },
        min_words: { type: 'integer' },
        max_words: { type: 'integer' },
        instructions: { type: 'string' },
        media_id: { type: 'string' },
      },
    },
    answerSchema: {
      type: 'object',
      properties: {
        // No auto-scoring fields — grading is always manual / LLM review.
        rubric: { type: 'string' },
        reference_text: { type: 'string' },
        criteria: { type: 'array', items: { type: 'string' } },
      },
    },
    defaultCheckSettings: {},
    supportedLanguages: Prisma.DbNull,
  },
  {
    code: 'sentence_schema',
    name: 'Sentence Schema',
    description: 'Place the words of a sentence into topological fields (Norwegian setningsskjema)',
    contentSchema: {
      type: 'object',
      required: ['sentence', 'fields', 'tokens'],
      properties: {
        // Full sentence shown for reference.
        sentence: { type: 'string' },
        // Drives UI labelling for main vs subordinate clause schemas.
        schema_type: { type: 'string', enum: ['main', 'subordinate'] },
        // Ordered columns of the schema.
        fields: {
          type: 'array',
          minItems: 2,
          items: {
            type: 'object',
            required: ['id', 'label'],
            properties: {
              id: { type: 'string' },
              label: { type: 'string' },
            },
          },
        },
        // Pre-split, draggable words / chunks.
        tokens: {
          type: 'array',
          minItems: 2,
          items: {
            type: 'object',
            required: ['id', 'text'],
            properties: {
              id: { type: 'string' },
              text: { type: 'string' },
            },
          },
        },
        // Optional given placements (worked example row).
        prefilled: {
          type: 'array',
          items: {
            type: 'object',
            required: ['field_id', 'token_id'],
            properties: {
              field_id: { type: 'string' },
              token_id: { type: 'string' },
            },
          },
        },
        context: { type: 'string' },
      },
    },
    answerSchema: {
      type: 'object',
      required: ['placements'],
      properties: {
        placements: {
          type: 'array',
          items: {
            type: 'object',
            required: ['field_id', 'token_ids'],
            properties: {
              field_id: { type: 'string' },
              // Ordered tokens placed in this field; empty array allowed.
              token_ids: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        explanation: { type: 'string' },
      },
    },
    defaultCheckSettings: { allow_partial_credit: true, order_sensitive: true },
    supportedLanguages: Prisma.DbNull,
  },
];

async function main(): Promise<void> {
  console.log('Seeding exercise templates...');

  for (const template of templates) {
    const {
      code,
      name,
      description,
      contentSchema,
      answerSchema,
      defaultCheckSettings,
      supportedLanguages,
    } = template;

    await prisma.exerciseTemplate.upsert({
      where: { code },
      update: {
        name,
        description,
        contentSchema,
        answerSchema,
        defaultCheckSettings,
        supportedLanguages,
        isActive: true,
      },
      create: {
        code,
        name,
        description,
        contentSchema,
        answerSchema,
        defaultCheckSettings,
        supportedLanguages,
        isActive: true,
      },
    });

    console.log(`  ✓ ${code}`);
  }

  console.log(`Done. ${templates.length} exercise templates seeded.`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
