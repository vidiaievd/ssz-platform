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

// ─── translate_to_target / translate_from_target ──────────────────────────────
// A set of sentences with one submission. The two codes share every schema: the
// direction lives in `content.dir`, and a mixed set (`dir: "both"`) is stored
// under translate_to_target. See packages/shared-kernel/src/translate and
// docs/plan/42-translate.md.

/** Substrings the answer must (or must not) contain, each with its explanation. */
const translateGuardSchema = {
  type: 'array',
  items: {
    type: 'object',
    required: ['text'],
    properties: {
      text: { type: 'string' },
      // Shown to the student the moment the guard fires — the one deviation
      // this engine can name exactly.
      note: { type: 'string' },
    },
  },
};

/** Everything a student may see. The accepted translations are NOT here. */
const translateContentSchema = (defaultDir: 'to_target' | 'from_target') => ({
  type: 'object',
  required: ['items'],
  properties: {
    dir: {
      type: 'string',
      enum: ['to_target', 'from_target', 'both'],
      default: defaultDir,
      description: 'Which way the set is translated; "both" is a mixed set',
    },
    // Labels shown to the student, not matched on.
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
          // Audio of `source` — per sentence, because the sentences differ.
          // Only meaningful when the source is in the target language.
          mediaId: { type: 'string' },
        },
      },
    },
    // What the machine accepts. It may only ever approve: `exactPass` closes an
    // item on a hit, and no combination of these rejects anything.
    check: {
      type: 'object',
      properties: {
        on: { type: 'boolean' },
        caseInsensitive: { type: 'boolean' },
        ignorePunct: { type: 'boolean' },
        // Off by default: with it on, "bla" passes for "blå".
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
        // null = unlimited, the only value the UI sets today. Carried so a
        // listening template can turn it on without a content migration.
        replayLimit: { type: ['integer', 'null'], minimum: 1 },
      },
    },
    // Stored from the first version so that connecting a model later needs no
    // migration. Nothing reads it yet, and every AI surface is inert.
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
});

// The answer key, keyed by item id so reordering items cannot shuffle it. The
// submitted answer does NOT share this shape — it is one typed sentence per
// item — so the engine checks the submission in its own validator instead.
const translateAnswerSchema = {
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
    // Field names are camelCase. That is the platform rule from now on, not an
    // exception here: everything else in the system — Prisma models, the DTOs of
    // every service, the event contracts — is camelCase, and the inside of these
    // two JSON columns was the only place that was not. A snake_case shape would
    // also need a mapper on the server and another in the web client, which is
    // two more places for the two to disagree about one document.
    //
    // The twelve older templates still read snake_case and move over one at a
    // time, each with its own data, validator, form and mobile body in a single
    // commit. See docs/plan/34-exercise-types-audit.md §7 in ssz-platform-web.
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
        // `mediaId`, not `media_id`: this template is the first under the
        // camelCase rule. The other twelve still declare `media_id` and rename
        // in one pass — it is free, no exercise has ever set it.
        mediaId: { type: 'string' },
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
    // "Find and correct the mistakes". The author writes the faulty sentence
    // and the answer key; the mistakes themselves are derived by aligning the
    // two word by word — never listed, and never stored. See
    // packages/shared-kernel/src/error-correction and the design handoff.
    code: 'error_correction',
    name: 'Find and Correct Mistakes',
    description: 'Spot what is wrong in each sentence and rewrite it, word by word',
    contentSchema: {
      type: 'object',
      required: ['items'],
      properties: {
        // Everything a student may see. The answer key is NOT here — it lives
        // in expected_answers, because the spans are derivable from it and the
        // spans are the exercise.
        items: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['id', 'wrong'],
            properties: {
              id: { type: 'string', description: 'Stable; keys this item in expected_answers' },
              wrong: { type: 'string', description: 'The sentence the student meets' },
              hint: { type: 'string' },
            },
          },
        },
        // 'passage' is one item holding a whole paragraph; 'sentences' is many
        // items with typically one mistake each. Presentation and validation
        // only — the model is identical either way.
        mode: { type: 'string', enum: ['sentences', 'passage'] },
        note: { type: 'string' },
        // What the student is told before answering.
        hints: {
          type: 'object',
          properties: {
            count: { type: 'boolean', description: 'How many mistakes there are' },
            mark: { type: 'boolean' },
            hintText: { type: 'boolean' },
            showType: { type: 'boolean' },
          },
        },
        // What the machine accepts. `caseInsensitive` and `ignorePunct` default
        // to false: in error correction a capital letter or a comma is often
        // the mistake itself.
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
        // Stored from the first version so that connecting a model later needs
        // no migration. Nothing reads it yet, and every AI surface is inert.
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
        mediaId: { type: 'string' },
      },
    },
    // The answer key, keyed by item id so reordering items cannot shuffle it.
    // The submitted answer does NOT share this shape — it is a set of edits —
    // so the engine checks the submission in its own validator instead.
    answerSchema: {
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
              // Author overrides on derived spans, keyed by `wFrom:wTo:fix`.
              // The key is derived, so editing the sentence drops the override
              // with the span it explained — deliberately.
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
                    // Both forms accepted: the span stops counting as a mistake.
                    soft: { type: 'boolean' },
                  },
                },
              },
              teacherNote: { type: 'string' },
            },
          },
        },
      },
    },
    // Scoring settings live in `content.check`, per the handoff: they are the
    // author's editorial choices and belong with the exercise, not with the
    // template. Only partial credit is a platform-wide concern.
    defaultCheckSettings: { allow_partial_credit: true },
    supportedLanguages: Prisma.DbNull,
  },
  {
    code: 'translate_to_target',
    name: 'Translate to Target Language',
    description: 'Translate sentences from the explanation language into the target language',
    contentSchema: translateContentSchema('to_target'),
    answerSchema: translateAnswerSchema,
    // Scoring settings live in `content.check`: they are the author's editorial
    // choices and belong with the exercise. Partial credit is off because the
    // submission is one set — either every sentence hit the key, or a teacher
    // reads the whole thing.
    defaultCheckSettings: { allow_partial_credit: false },
    supportedLanguages: Prisma.DbNull,
  },
  {
    code: 'translate_from_target',
    name: 'Translate from Target Language',
    description: 'Translate sentences from the target language into the explanation language',
    contentSchema: translateContentSchema('from_target'),
    answerSchema: translateAnswerSchema,
    defaultCheckSettings: { allow_partial_credit: false },
    supportedLanguages: Prisma.DbNull,
  },
  {
    code: 'match_pairs',
    name: 'Match Pairs',
    description: 'Match each left item with its right half, from a pool holding distractors',
    // Second of the camelCase templates, after `word_bank_gap_fill`, and the
    // second whose content holds the answers: a pair is stored whole, so
    // `pairs[].right` IS the answer to `pairs[].left`. Never serve this content
    // to a student unprojected — see `studentSafeContent`.
    contentSchema: {
      type: 'object',
      required: ['pairs', 'settings'],
      properties: {
        pairs: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['id', 'rightId', 'left', 'right'],
            properties: {
              id: { type: 'string', description: 'Stable; keys the feedback matrix row and the student slot' },
              // Deliberately NOT the pair id. Slots are keyed by `id` and pool
              // items by `rightId`, so the student payload shares no identifier
              // between the two columns and cannot be read as an answer key.
              rightId: {
                type: 'string',
                description: 'This half as a pool item. Same namespace as distractor ids, never equal to `id`',
              },
              left: { type: 'string' },
              right: { type: 'string', description: 'THE ANSWER for `left`. Never sent to a student before reveal.' },
            },
          },
        },
        // Extra right halves that complete nothing. Same shape as a pair's
        // right half by design: in the pool the two must be indistinguishable.
        distractors: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'text'],
            properties: {
              id: { type: 'string' },
              text: { type: 'string' },
            },
          },
        },
        // Not presentation only, despite what this comment used to say: the
        // variant decides whether a missing default explanation is a blocker
        // (`halves`, where a wrong half is explicable only by grammar the
        // student cannot see) or a warning (`pairs`, word <-> translation).
        // That is the difference between a course version publishing and not.
        // See docs/plan/49-match-pairs.md, decision 3.
        variant: { type: 'string', enum: ['pairs', 'halves'] },
        settings: {
          type: 'object',
          required: ['distractors', 'shuffle', 'showRemaining'],
          properties: {
            // Whether the extras take part. Turning it off hides them from the
            // pool; it never deletes them or their explanations.
            distractors: { type: 'boolean' },
            shuffle: { type: 'boolean' },
            showRemaining: { type: 'boolean' },
          },
        },
      },
    },
    // Everything the student must not see before checking. The answers are not
    // here — they are in `content.pairs[].right`.
    answerSchema: {
      type: 'object',
      required: ['feedback'],
      properties: {
        feedback: {
          type: 'object',
          description: 'Keyed by pair id',
          additionalProperties: {
            type: 'object',
            required: ['def'],
            properties: {
              // Shown for any wrong half with no override of its own.
              def: { type: 'string' },
              // Why the right half is the right one. Shown on reveal.
              why: { type: 'string' },
              // Pool item id -> why attaching THAT half to THIS left half is
              // wrong. Empty cells are legitimate: 5 pairs x 8 halves is 35.
              ov: {
                type: 'object',
                additionalProperties: {
                  type: 'object',
                  required: ['text', 'origin'],
                  properties: {
                    text: { type: 'string' },
                    origin: { type: 'string', enum: ['author', 'ai_draft'] },
                  },
                },
              },
            },
          },
        },
      },
    },
    defaultCheckSettings: { allow_partial_credit: true },
    supportedLanguages: Prisma.DbNull,
  },
  {
    code: 'short_answer',
    name: 'Short Answer',
    description: 'Answer a set of open comprehension questions in a few words or sentences',
    // Rewritten for the design handoff (docs/plan/51-short-answer.md). The old
    // shape was one question with a list of accepted strings; the new one is a
    // set of open questions whose key is semantic elements — each element one
    // thing the answer must say, carrying two or three anchor phrases a student
    // might say it with. A free answer cannot be compared to a string, which is
    // what the old shape tried to do.
    //
    // Both shapes are described here, and deliberately so. Plan 51 §8 Q1: the
    // 144 seeded documents of the old form stay live until the catalogue is
    // rewritten, and this schema is checked on every write to any of them.
    // Replacing it outright would make every one of those exercises unsaveable.
    // `isShortAnswerDocument` in the kernel is what every reader dispatches on;
    // `anyOf` here is the same test spelled for AJV.
    //
    // Fourth of the camelCase templates. Like `writing_task`, the content holds
    // no answer: the elements, the model answer and the explanation are lifted
    // into expected_answers by the kernel's persistence module, so
    // `studentSafeContent` has nothing it could fail to strip. The anchors are
    // not merely sensitive — they are the answer written in the words the
    // student is being asked to find.
    contentSchema: {
      type: 'object',
      anyOf: [{ required: ['questions'] }, { required: ['question'] }],
      properties: {
        // ── The new form ──
        title: { type: 'string', description: 'Teacher-facing name of the set' },
        instruction: {
          type: 'string',
          description: 'One line, shown above every question in the runner',
        },
        // No `minItems`, deliberately — same reasoning as `writing_task`. This
        // schema is checked on every write, and a document being written is
        // unfinished by definition: an author who has not added a question yet
        // would find the exercise unsaveable, and with autosave, silently so.
        // That a set needs at least one question is true and is enforced at
        // publication instead, where it can be reported rather than swallowed.
        questions: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'prompt'],
            properties: {
              id: { type: 'string' },
              // Controls the passage field only, never the grading:
              // `reading` shows the passage, `listening` keeps it author-side
              // as the transcript, `opinion` has none.
              kind: { type: 'string', enum: ['reading', 'listening', 'opinion'] },
              passage: { type: 'string' },
              prompt: { type: 'string' },
            },
          },
        },
        settings: {
          type: 'object',
          properties: {
            // How many required elements a pass needs.
            passRule: { type: 'string', enum: ['all', 'n'] },
            passN: { type: 'integer', minimum: 1, maximum: 3 },
            // Tolerate a one-letter slip inside a word longer than three
            // characters. The short-word exemption is what keeps `bak` and
            // `bok` apart, and it is in the kernel, not here.
            typos: { type: 'boolean' },
            caseless: { type: 'boolean' },
            // 0 = off. A shorter answer is flagged too short and can never
            // reach `pass` — flagged, not failed.
            minWords: { type: 'integer', minimum: 0 },
            showBreakdown: { type: 'boolean' },
            showModel: { type: 'string', enum: ['always', 'onClose', 'never'] },
            // Display switches only — nothing calls a model in this build
            // (plan 51 §3.6). Carried from the first commit so that connecting
            // the stage later needs no migration.
            aiStage: { type: 'boolean' },
            aiGrammar: { type: 'boolean' },
            teacherReview: { type: 'string', enum: ['all', 'flagged', 'none'] },
            progress: { type: 'boolean' },
          },
        },

        // ── The old form, still live ──
        // One question, answered against a list of accepted strings. Kept until
        // the 144 documents written this way are rewritten; see the note above.
        question: { type: 'string' },
        context: { type: 'string' },
        media_id: { type: 'string' },
        max_length: { type: 'integer' },
      },
    },
    // The author's answer key, in either form. Unlike before, this schema no
    // longer doubles as the learner's submission schema: `short_answer` joins
    // `OWN_SUBMISSION_SHAPE` in exercise-engine, because the new key is a map
    // of semantic elements and the new submission is a list of typed answers,
    // and one schema stretched over both would describe neither. The engine
    // checks the submission shape in the validator, where a bad one is a client
    // bug rather than a wrong answer.
    answerSchema: {
      type: 'object',
      properties: {
        // ── The new form ──
        questions: {
          type: 'object',
          description: 'Keyed by question id',
          additionalProperties: {
            type: 'object',
            properties: {
              // One element = one thing the answer must say. It grades only
              // once it has both a label and a non-empty anchor; a half-written
              // one is persisted as authored and filtered at grading time, so
              // the author may walk away mid-sentence.
              elements: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    label: { type: 'string', description: "In the teacher's words" },
                    // 2-3 phrasings a student might use. Never shown to the
                    // student — they are the answer.
                    anchors: { type: 'array', items: { type: 'string' } },
                    // Optional elements are reported in the breakdown but never
                    // block a pass.
                    required: { type: 'boolean' },
                  },
                },
              },
              // The answer the author would accept. Required at publication:
              // it is what the key is validated against, and a key its own
              // author's answer cannot pass is one no student will pass.
              model: { type: 'string' },
              // Shown under every verdict.
              why: { type: 'string' },
            },
          },
        },

        // ── The old form, still live ──
        text: { type: 'string', description: "The learner's submission, old form" },
        reference_answer: { type: 'string' },
        accepted_answers: { type: 'array', items: { type: 'string' } },
        rubric: { type: 'string' },
        explanation: { type: 'string' },
      },
    },
    // Read by the old form's diff only. The new form takes every check setting
    // from `content.settings`, where the author set it, rather than from a
    // template default no builder surfaces.
    defaultCheckSettings: { case_sensitive: false, trim_whitespace: true },
    supportedLanguages: Prisma.DbNull,
  },
  {
    code: 'writing_task',
    name: 'Writing Task',
    description: 'Write a whole text — a letter, an essay, a picture description, a retelling or an open topic',
    // Rewritten for the design handoff (docs/plan/50-writing-task.md). The old
    // shape was a slice of the generic exercise form — prompt, optional topic
    // list, min/max words, snake_case — and had no modes, no must-cover points,
    // no rubric. Five subtypes now share one document, selected by `mode`; the
    // rubric a human marks against is part of the exercise, not the teacher's
    // memory.
    //
    // Third of the camelCase templates. Unlike the other two, the content holds
    // no answers — the key (point keywords, level descriptors, the example
    // answer) is lifted into expected_answers by the kernel's persistence
    // module, so `studentSafeContent` has nothing it could fail to strip. The
    // one exception runs the other way: with `showRubric: 'always'` the
    // descriptors are a writing guide and must reach the student *before* the
    // mark, which is why the projection takes both columns (plan 50 §5).
    contentSchema: {
      type: 'object',
      required: ['mode', 'prompt', 'points', 'rubric', 'settings'],
      properties: {
        // Decides which material block the task carries and how the prompt is
        // framed; nothing else. `picture` is a mode rather than its own
        // template so that the rubric editor, the validation engine and the
        // review queue exist once (handoff README, "Why picture is a mode").
        mode: { type: 'string', enum: ['letter', 'essay', 'picture', 'retell', 'free'] },
        instruction: { type: 'string', description: 'One line, student-facing' },
        prompt: { type: 'string', description: 'The situation, not the checklist' },
        // Material per mode. Fields belonging to another mode stay in the
        // record — switching mode must not lose an author's text — and are
        // neither shown nor validated.
        source: { type: 'string', description: '`retell` only — the text being retold' },
        image: {
          type: 'object',
          description: '`picture` only',
          properties: {
            // Resolved through the media picker. Missing = a publication
            // blocker, not a warning: a picture task with no picture is unusable.
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
        // What the text must cover, 1-6 of them. The student sees `text` as a
        // checklist item; the phrasings that would satisfy it live in
        // expected_answers and are used only by the (unbuilt) AI pre-check —
        // never to reject an answer.
        //
        // No `minItems` here or on `rubric`, deliberately. This schema is checked on
        // every write, and a document being written is unfinished by definition: an
        // author who has not added a point yet, or who cleared the list to start over,
        // would find the exercise unsaveable — and with autosave, silently so. That a
        // task needs at least one point and a rubric to mark against is true and is
        // enforced where it belongs: `issues()` reports it in the builder and the
        // publication preflight refuses to hand it to a student.
        points: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'text'],
            properties: {
              id: { type: 'string', description: 'Stable; keys this point in expected_answers' },
              text: { type: 'string' },
              required: { type: 'boolean', description: 'Optional points do not count towards a pass' },
            },
          },
        },
        phrases: {
          type: 'array',
          description: 'Optional sentence openers offered to the student',
          items: { type: 'string' },
        },
        // 2-6 criteria a human marks 0-3 against. The level descriptors are the
        // answer key half of a criterion and are NOT here.
        rubric: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'name'],
            properties: {
              id: { type: 'string', description: 'Stable; keys this criterion in expected_answers and in an attempt’s marks' },
              name: { type: 'string' },
              desc: { type: 'string', description: 'What the criterion is about, teacher-facing' },
              weight: { type: 'integer', enum: [1, 2] },
              // Which heuristic suggests a mark for this criterion. Explicit
              // rather than positional (plan 50 §3.4) so a reordered or custom
              // rubric gets sensible suggestions or, with null, none at all.
              // A suggestion is never a grade: a person sets every mark.
              metric: { type: ['string', 'null'], enum: ['points', 'paragraphs', 'language', 'lexis', null] },
            },
          },
        },
        settings: {
          type: 'object',
          required: ['minWords', 'maxWords', 'passScore'],
          properties: {
            minWords: { type: 'integer', description: 'Submit is locked below this; 0 = no minimum' },
            maxWords: { type: 'integer', description: '0 = no ceiling' },
            timer: { type: 'integer', description: 'Minutes, 0 = off; counts down from the first keystroke' },
            blockPaste: { type: 'boolean' },
            autosave: { type: 'boolean' },
            showWordCount: { type: 'boolean' },
            showPlan: { type: 'boolean', description: 'Must-cover points as a student checklist' },
            showPhrases: { type: 'boolean' },
            // 'always' is the one setting that pulls level descriptors out of
            // expected_answers before grading — see the note above.
            showRubric: { type: 'string', enum: ['always', 'afterGraded', 'never'] },
            showModel: { type: 'string', enum: ['afterGraded', 'never'] },
            // In rubric points, out of Sigma 3 x weight — not a percentage. The
            // attempt's score is normalised to one (plan 50 §3.2), the
            // threshold the author writes is not.
            passScore: { type: 'integer' },
            // Display switches only. Nothing calls a model in this build; the
            // fields exist so that connecting one later needs no migration
            // (plan 48).
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
    },
    // The answer key: everything IMPLEMENTATION.md forbids reaching a student
    // before a teacher has graded. Keyed by id on both sides, so reordering the
    // points or the criteria cannot shuffle the key onto the wrong row.
    //
    // It grades nothing. `writing_task` has no auto-check by construction —
    // every submission is read by a person — and these three fields exist for
    // the author's own preview, the teacher's queue, and the AI stage when it
    // is built.
    answerSchema: {
      type: 'object',
      properties: {
        points: {
          type: 'object',
          description: 'Keyed by point id',
          additionalProperties: {
            type: 'object',
            properties: {
              // 2-3 phrasings. Used only by the AI pre-check, never to reject.
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
              // Descriptors for levels 0, 1, 2, 3, in that order.
              levels: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'string' } },
            },
          },
        },
        model: { type: 'string', description: 'Example answer. Recommended, never a blocker.' },
      },
    },
    // Nothing to configure: there is no auto-check to tune. The thresholds that
    // matter (`passScore`, the word range) are the author's editorial choices
    // and live in `content.settings` with the rest of the document.
    defaultCheckSettings: {},
    supportedLanguages: Prisma.DbNull,
  },
  {
    code: 'sentence_schema',
    name: 'Sentence Schema',
    description: 'Lay a set of sentences out on a topological field board — one schema, many sentences',
    // Rewritten for the design handoff (docs/plan/52-sentence-schema.md). The old
    // shape was one sentence, its fields declared inline as `{ id, label }`, its
    // words as `tokens[]`, and the key an ordered `placements[]` — snake_case
    // throughout. The new one is a **set of sentences over one schema**, and the
    // governing idea is that the field set is data rather than Norwegian: a
    // schema is a field list per clause type, seeded from a language pack and
    // freely editable, so the same runtime serves the setningsskjema, the German
    // Feldermodell, or three unnamed boxes.
    //
    // One shape, not two. Plan 52 §8 Q7 reversed the decision to keep the old
    // form alive: all seven seeded exercises were rewritten, so there is no
    // document left that the old schema describes and nothing to dispatch on.
    // A document that still has `sentence` / `fields` / `tokens` is refused here
    // rather than accepted and quietly graded as an empty set.
    //
    // Fifth of the camelCase templates. The content holds no answer: which field
    // each chunk belongs in, which other fields also accept it, the rule and the
    // per-chunk notes are lifted into expected_answers by the kernel's
    // persistence module — and so is `row.text`, which the handoff's Security
    // section omits and plan 52 §3.2 adds, because a sentence in the correct
    // order is the answer written out as a string.
    contentSchema: {
      type: 'object',
      required: ['rows'],
      properties: {
        title: { type: 'string', description: 'Teacher-facing name of the set' },
        instruction: {
          type: 'string',
          description: 'One line, shown above the board in the runner',
        },
        // Which language pack the schema was seeded from — provenance only. The
        // schema below is authoritative and may have been edited past
        // recognition; a converted exercise with hand-written fields carries
        // `blank`, and that is correct.
        presetId: { type: 'string' },
        // Which clause types are switched on, and so selectable per sentence.
        clauses: {
          type: 'array',
          items: { type: 'string', enum: ['main', 'sub', 'yesno', 'hv', 'imp'] },
        },
        // The board: an ordered field list per clause type. Field ids are scoped
        // to the clause they live in — that is the single most consequential fact
        // in this model, because it is why changing a sentence's clause type
        // clears its placements instead of remapping them.
        schema: {
          type: 'object',
          additionalProperties: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'short'],
              properties: {
                id: { type: 'string' },
                // The key shown on the board: "F", "v", "n", "VF". Terse on purpose.
                short: { type: 'string' },
                label: { type: 'string' },
                hint: { type: 'string' },
                // May legitimately stay empty: drives the `—` in an empty cell
                // and stops the grader expecting something there.
                optional: { type: 'boolean' },
              },
            },
          },
        },
        // No `minItems` on `rows`, and none on `chunks` either — the same
        // reasoning as `writing_task` and `short_answer`. This schema is checked
        // on every write, and a document being written is unfinished by
        // definition: an author who has typed a sentence but not yet split it,
        // or who has added no sentence at all, would find the exercise
        // unsaveable, and with autosave, silently so. That a set needs a
        // deliverable sentence is true and is enforced at publication instead,
        // where it can be reported rather than swallowed.
        rows: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string' },
              clause: { type: 'string', enum: ['main', 'sub', 'yesno', 'hv', 'imp'] },
              // The sentence the student starts from, when the task is "rewrite,
              // then lay out" rather than "lay out". An extension beyond the
              // handoff (plan 52 §3.8): every seeded exercise of this type is a
              // transformation, and the model as drawn cannot express one. It is
              // a prompt and nothing else — never tokenized, never banked, never
              // graded.
              source: { type: 'string' },
              // The pieces of the sentence, in sentence order. One chunk may be
              // several words joined ("I morgen"): that is how "one constituent"
              // gets expressed, and it is what makes the V2 rule checkable.
              // The texts stay here because they are the word bank the student
              // must see; what is withheld is where each one goes.
              chunks: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'text'],
                  properties: {
                    id: { type: 'string' },
                    text: { type: 'string' },
                  },
                },
              },
              // Distractors: pieces that belong in no field and are always
              // wrong. They never count toward the sentence, so a row made only
              // of extras cannot exist.
              extras: {
                type: 'array',
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
        // Nine switches over one answer key — the same exercise from heavily
        // scaffolded to bare. Listed here in the builder's order: strongest
        // support first.
        settings: {
          type: 'object',
          properties: {
            labels: { type: 'boolean', description: 'Show field names, not only the short keys' },
            hints: { type: 'boolean' },
            counts: {
              type: 'boolean',
              description: 'Show how many chunks belong in each field — a partial key, enforced in the projection',
            },
            prefill: { type: 'string', enum: ['none', 'first'] },
            // Declared by the handoff and left unbuilt by it; plan 52 Q6 keeps
            // that. Carried so building it later needs no migration. Nothing
            // reads it.
            markEmpty: { type: 'boolean' },
            perField: { type: 'boolean', description: 'Mark each field, not only the sentence' },
            hintAfterMistake: { type: 'boolean' },
            shuffle: { type: 'boolean', description: 'Shuffle the bank — applied server-side' },
            extras: { type: 'boolean', description: 'Include the distractors in the bank' },
            order: {
              type: 'string',
              enum: ['strict', 'loose'],
              description: 'Whether order inside a single field is graded',
            },
          },
        },
      },
    },
    // The author's key. As with `short_answer`, this schema does not double as
    // the learner's submission schema: `sentence_schema` sits in
    // `OWN_SUBMISSION_SHAPE` in exercise-engine, because the key is a map of
    // fields per chunk and the submission is a board per sentence. One schema
    // over both would describe neither, and the one guarding the author's
    // document is the one worth keeping strict.
    answerSchema: {
      type: 'object',
      properties: {
        // Keyed by row id, so reordering the sentences cannot shuffle the key
        // onto the wrong ones.
        rows: {
          type: 'object',
          description: 'Keyed by sentence id',
          additionalProperties: {
            type: 'object',
            properties: {
              // The sentence in its correct order — answer-bearing, which is why
              // it lives here and not in the content.
              text: { type: 'string' },
              // Why the sentence is built this way. Required at publication: it
              // is shown on success, it is the last-resort explanation for a
              // wrong placement, and it is the escalating hint. One line doing
              // three jobs is why an exercise without it cannot be published.
              why: { type: 'string' },
              // chunkId → the field it belongs in.
              fields: {
                type: 'object',
                additionalProperties: { type: ['string', 'null'] },
              },
              // chunkId → other fields that also accept it. How "I morgen" is
              // right in the forfelt *and* in the adverbial, without a second
              // full layout.
              alt: {
                type: 'object',
                additionalProperties: { type: 'array', items: { type: 'string' } },
              },
              // chunkId → the explanation shown instead of the default when that
              // chunk lands wrong.
              fb: {
                type: 'object',
                additionalProperties: { type: 'string' },
              },
            },
          },
        },
      },
    },
    // `allow_partial_credit` is the one setting still read here: it decides what
    // an imperfect sentence is worth to the set (plan 52 §3.4). `order_sensitive`
    // is carried for the attempts written against it and is no longer read —
    // whether order inside a field is graded is `content.settings.order`, where
    // the author set it.
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
