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
