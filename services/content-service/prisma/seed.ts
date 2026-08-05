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
    // Several multiple-choice questions checked together, the way a workbook
    // prints them: a true/false table over one text, or a set of "what does
    // this word mean?" questions. Deliberately separate from multiple_choice,
    // which is one question with its own check.
    code: 'multiple_choice_group',
    name: 'Multiple Choice Group',
    description: 'Answer several multiple-choice questions, checked as one block',
    contentSchema: {
      type: 'object',
      required: ['items'],
      properties: {
        // Options every question shares — a Riktig / Galt column pair. Questions
        // may still carry their own; an item's own options always win.
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
        items: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['id', 'question'],
            properties: {
              id: { type: 'string' },
              question: { type: 'string' },
              // Omit to use the group's shared options.
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
            },
          },
        },
        context: { type: 'string' },
        media_id: { type: 'string' },
      },
    },
    // As with word_bank_fill, this one schema validates both sides: the
    // author's key at authoring time and the learner's picks at submit time,
    // the submission carrying its chosen id in `correct_option_ids`.
    answerSchema: {
      type: 'object',
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['id', 'correct_option_ids'],
            properties: {
              id: { type: 'string' },
              correct_option_ids: {
                type: 'array',
                items: { type: 'string' },
                minItems: 1,
              },
              // Why this question's answer is what it is; shown per question
              // after checking.
              explanation: { type: 'string' },
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
        // Notes about the bank words, shared by every blank: in a drill on
        // at / om the reason a word fits is the same in all its sentences, so
        // it is authored once here instead of per blank. Feedback only.
        word_notes: { type: 'object', additionalProperties: { type: 'string' } },
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
    // Textbook-style gap-fill: several sentences sharing ONE word bank, each
    // blank picked from that bank. Deliberately separate from fill_in_blank,
    // which is single-sentence and whose blanks are typed, not chosen.
    code: 'word_bank_fill',
    name: 'Word Bank Gap-Fill',
    description: 'Complete several sentences using words from a shared bank',
    contentSchema: {
      type: 'object',
      required: ['word_bank', 'items'],
      properties: {
        word_bank: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          description: 'Choices offered for every blank of every sentence',
        },
        items: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['id', 'text_with_blanks'],
            properties: {
              id: { type: 'string' },
              text_with_blanks: {
                type: 'string',
                description: 'Use ___N___ for blanks, numbered within this sentence',
              },
            },
          },
        },
        context: { type: 'string' },
        media_id: { type: 'string' },
        // Notes about the bank words, shared by every blank: in a drill on
        // at / om the reason a word fits is the same in all its sentences, so
        // it is authored once here instead of per blank. Feedback only.
        word_notes: { type: 'object', additionalProperties: { type: 'string' } },
        // Set for drills where one bank word answers several blanks — a grammar
        // exercise on at / om reuses both many times. It turns off the player's
        // "spent word" dimming, which would otherwise grey out the right answer.
        reusable_words: { type: 'boolean' },
        // How the player offers the bank. 'chips' (default) is the textbook
        // layout — one strip of words above the sentences, tapped into the
        // armed blank. 'select' puts the whole bank in a dropdown inside each
        // blank, which suits short vocabulary drills. Presentation only:
        // grading is identical either way.
        input_mode: { type: 'string', enum: ['chips', 'select'] },
      },
    },
    answerSchema: {
      type: 'object',
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['id', 'blanks'],
            properties: {
              id: { type: 'string' },
              blanks: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  required: ['blank_id', 'accepted_answers'],
                  properties: {
                    blank_id: { type: 'integer' },
                    // Same convention as fill_in_blank: the expected answers
                    // list here, and the learner's single pick when this schema
                    // validates a SUBMITTED answer.
                    accepted_answers: {
                      type: 'array',
                      items: { type: 'string' },
                      minItems: 1,
                    },
                    // Post-check teaching aid, identical in shape to
                    // fill_in_blank's — presentational, never scored.
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
                              text: { type: 'string' },
                              verdict: {
                                type: 'string',
                                enum: ['correct', 'acceptable', 'wrong'],
                              },
                              note: { type: 'string' },
                            },
                          },
                        },
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
      // Each bank word is consumed by at most one blank (textbook default).
      unique_bank_words: true,
    },
    supportedLanguages: Prisma.DbNull,
  },
  {
    // The successor to word_bank_fill AND fill_in_blank (plan 35). Two things
    // make it a new template rather than an edit of either.
    //
    // First, the sentence is stored SOLVED: `sentences[].text` reads the way it
    // does when finished, and a gap is a token index into it. The answer is a
    // slice of the text, never a separate field, so renaming a word moves the
    // answer, the bank and the feedback column in one edit. The consequence is
    // that `content` here is NOT what the student may see — the read model has
    // to cut the gapped tokens out before it leaves the service. See the
    // student projection.
    //
    // Second, feedback is authored per (gap × wrong word) pair, so that a
    // learner who puts «bestilt» where «bestille» belongs is told about that
    // confusion rather than about being wrong.
    //
    // Field names are camelCase, unlike every other template here. The same
    // TypeScript reads and writes this document on the server and in the web
    // client (@ssz/shared-kernel), and a snake_case wire shape would need a
    // mapper on each side — two more places for the two to disagree, which is
    // exactly what the shared package exists to prevent.
    code: 'word_bank_gap_fill',
    name: 'Gap-Fill',
    description:
      'Complete sentences from a shared word bank or by typing, with per-word explanations',
    contentSchema: {
      type: 'object',
      required: ['sentences', 'settings'],
      properties: {
        sentences: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['id', 'text', 'gaps'],
            properties: {
              id: { type: 'string', description: 'Stable; every gap key is built from it' },
              text: {
                type: 'string',
                description: 'The sentence AS SOLVED. Holds the answers — never send it as-is.',
              },
              gaps: {
                type: 'array',
                items: { type: 'integer', minimum: 0 },
                description: 'Whitespace-token indices into `text`, unordered',
              },
              hint: { type: 'string' },
            },
          },
        },
        // Wrong words the teacher added. Empty in free-input mode, where there
        // is no bank. Answers are never listed here: they are derived.
        distractors: { type: 'array', items: { type: 'string' } },
        settings: {
          type: 'object',
          required: ['shuffle', 'allowReuse', 'showBankCount', 'caseSensitive', 'input'],
          properties: {
            shuffle: { type: 'boolean' },
            // A word may fill several gaps and is not spent. Required when one
            // word answers more than one gap.
            allowReuse: { type: 'boolean' },
            showBankCount: { type: 'boolean' },
            caseSensitive: { type: 'boolean' },
            // 'bank' shows the shared chip strip; 'free' hides it and the
            // student types, which is what absorbs the old fill_in_blank.
            input: { type: 'string', enum: ['bank', 'free'] },
          },
        },
        context: { type: 'string' },
        media_id: { type: 'string' },
      },
    },
    // Everything the student must not see before checking: the explanations,
    // and the extra spellings accepted in free-input mode. The answers
    // themselves are not here — they are in `content.sentences[].text`.
    answerSchema: {
      type: 'object',
      required: ['feedback'],
      properties: {
        feedback: {
          type: 'object',
          description: 'Keyed by gap: `${sentenceId}#${tokenIndex}`',
          additionalProperties: {
            type: 'object',
            required: ['fallback'],
            properties: {
              // Shown for any wrong word with no explanation of its own.
              // Required for the exercise to be assignable.
              fallback: { type: 'string' },
              // Why the correct word is right. Shown on a correct gap and on
              // reveal.
              why: { type: 'string' },
              // Bank word → why choosing THAT word here is wrong. Empty cells
              // are legitimate: 5 gaps × 10 words is 50 pairs.
              pairs: {
                type: 'object',
                additionalProperties: {
                  type: 'object',
                  required: ['text', 'origin'],
                  properties: {
                    text: { type: 'string' },
                    // 'ai_draft' is written but never shown: an unaccepted
                    // draft is not an explanation yet. Stored from the start so
                    // that adding AI drafting later needs no migration.
                    origin: { type: 'string', enum: ['author', 'ai_draft'] },
                  },
                },
              },
            },
          },
        },
        // Extra accepted spellings per gap. Honoured in free-input mode only —
        // with a bank the set is closed, and an "alternative" there could only
        // be another chip.
        alternatives: {
          type: 'object',
          additionalProperties: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    // Case sensitivity and word reuse are deliberately NOT repeated here: they
    // live in `content.settings`, where the author sets them, and a second copy
    // would be a second answer to the same question.
    defaultCheckSettings: { allow_partial_credit: true },
    supportedLanguages: Prisma.DbNull,
  },
  {
    // Put shuffled lines back in order: dialogue turns, sentences of a text,
    // or steps of an instruction. The client shuffles for display; `items`
    // order in content carries no meaning.
    code: 'text_order',
    name: 'Put in Order',
    description: 'Arrange shuffled lines into the correct order',
    contentSchema: {
      type: 'object',
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          minItems: 2,
          items: {
            type: 'object',
            required: ['id', 'text'],
            properties: {
              id: { type: 'string' },
              text: { type: 'string' },
              // Optional speaker label for dialogues, e.g. "Marina".
              speaker: { type: 'string' },
            },
          },
        },
        // Presentation hint only; scoring is identical either way.
        kind: { type: 'string', enum: ['dialogue', 'sentences'] },
        context: { type: 'string' },
        media_id: { type: 'string' },
      },
    },
    answerSchema: {
      type: 'object',
      required: ['order'],
      properties: {
        // Item ids, first to last. Doubles as the submitted-answer shape.
        order: {
          type: 'array',
          minItems: 2,
          items: { type: 'string' },
        },
        explanation: { type: 'string' },
      },
    },
    defaultCheckSettings: { allow_partial_credit: true },
    supportedLanguages: Prisma.DbNull,
  },
  {
    // "Find and correct the mistakes": each sentence is pre-split into chunks,
    // the learner picks the faulty ones and rewrites them. Splitting is the
    // author's job — it keeps the task tractable and the grading exact.
    code: 'error_correction',
    name: 'Find and Correct Mistakes',
    description: 'Spot the faulty parts of each sentence and rewrite them',
    contentSchema: {
      type: 'object',
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['id', 'chunks'],
            properties: {
              id: { type: 'string' },
              chunks: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  required: ['id', 'text'],
                  properties: {
                    id: { type: 'string' },
                    text: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        // How many chunks are faulty overall. Presentational: it tells the
        // learner when to stop looking; grading uses `corrections` alone.
        mistake_count: { type: 'integer', minimum: 1 },
        context: { type: 'string' },
        media_id: { type: 'string' },
      },
    },
    answerSchema: {
      type: 'object',
      required: ['corrections'],
      properties: {
        // The faulty chunks and their fixes. Doubles as the submitted-answer
        // shape: the learner sends the chunks they rewrote, `accepted` holding
        // their single rewrite.
        corrections: {
          type: 'array',
          items: {
            type: 'object',
            required: ['item_id', 'chunk_id', 'accepted'],
            properties: {
              item_id: { type: 'string' },
              chunk_id: { type: 'string' },
              accepted: {
                type: 'array',
                items: { type: 'string' },
                minItems: 1,
              },
              note: { type: 'string' },
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
      // Editing a chunk that was already correct costs a point, so the task
      // can't be brute-forced by rewriting everything.
      penalize_false_positives: true,
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
        // Presentation only — scoring is identical. `halves` numbers the left
        // column 1..n and letters the right A..N for sentence-halves tasks,
        // where the cells hold long text rather than single words.
        variant: { type: 'string', enum: ['pairs', 'halves'] },
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
    // This one schema validates two different objects against the same
    // property bag: content-service validates the AUTHOR's expectedAnswers
    // (reference_answer/accepted_answers/rubric) with it at authoring time,
    // while exercise-engine-service validates the STUDENT's submittedAnswer
    // (text) with the identical stored schema at submit time
    // (submit-answer.handler.ts passes def.template.answerSchema for both
    // uses). `anyOf` requires at least one side's shape to be present so
    // AJV accepts both without silently allowing a fully empty object.
    answerSchema: {
      type: 'object',
      anyOf: [{ required: ['text'] }, { required: ['reference_answer'] }],
      properties: {
        // Learner's submission (exercise-engine's ShortAnswerValidator).
        text: { type: 'string' },
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
        // The target sentence. Held back from the learner while
        // `source_sentence` is set, and shown with the feedback instead.
        sentence: { type: 'string' },
        // Optional starting point that turns the task into a transformation:
        // the learner rebuilds `sentence` from this one instead of copying it.
        source_sentence: { type: 'string' },
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
