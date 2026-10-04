// What each exercise template trains, when nothing more specific is known — plan 55 §3.4,
// bottom rung of the chain.
//
// Written the way `evidence-strength.ts` is written, and for the same reason: **a table
// of judgements must argue for itself.** Every row below says why it holds what it
// holds, because the alternative is a table nobody dares change in a year's time.
//
// Since plan 64 (decision F) a row does not name its channels. It says what goes in and
// what comes out, and `channelsOf` in `model.ts` reads the CEFR channels off the pair —
// so a recording added by the document or by the lesson changes the input and leaves
// the output alone, instead of replacing the whole list.
//
// Two rules govern the whole table:
//
// 1. **The axis is about the target language.** Producing a sentence in the language of
//    explanation is not written production in the language being learnt
//    (`written_l1`), and reading a prompt in it is not reading (`input: 'none'`). This is
//    what splits the two translate templates: one is `written`, the other is `reading`.
// 2. **A hint is given only where it is structural.** Where a template genuinely could
//    be about vocabulary or about grammar depending on what the author wrote, the focus
//    is left empty rather than guessed. An empty focus is visible in the report as
//    `unknown` and is a truthful statement; a guessed one is noise that cannot be
//    distinguished from a measurement.

import type { Focus, Form, Input, Modality, Output } from './model.js';

export interface TemplateProfile {
  /** What has to be taken in to answer. See `INPUTS` for what counts as `text`. */
  input: Input;
  /** What the learner makes. The CEFR channel is `channelsOf(input, output)`. */
  output: Output;
  /** Empty where the template cannot honestly say. See rule 2 above. */
  focus: readonly Focus[];
  /** `mixed` means the document decides — `derive.ts` reads it. */
  form: Form;
  /**
   * How the learner has to know it (plan 63 §2 E). `unknown` where the document decides,
   * the same convention `form: 'mixed'` follows — `derive.ts` reads it there.
   *
   * The line this column draws is between *picking* and *retrieving*, not between easy
   * and hard: a template that puts every answer on screen can only ever prove
   * recognition, however long the learner stares at it.
   */
  modality: Modality;
}

/**
 * All template codes of the catalogue — the thirteen of audit 34, including the two officially
 * retired, and the new types since (plan 66 onwards).
 *
 * `fill_in_blank` and `word_bank_fill` are absorbed by `word_bank_gap_fill` (plan 35) but
 * carry ~135 exercises between them, and the general authoring form still opens them.
 * A coverage report that skipped them would under-count a third of the catalogue.
 */
export const BY_TEMPLATE: Readonly<Record<string, TemplateProfile>> = {
  // Reads a stem, and usually a passage, then recognises the answer among options.
  // Nothing is produced. No focus hint: a set of questions about a text is comprehension,
  // a set about a verb form is grammar, and only the author knows which was written.
  multiple_choice: { input: 'text', output: 'none', focus: [], form: 'bank', modality: 'recognition' },

  // Same channel as the set above; the difference between the two types is the shared
  // column, which changes the unit of delivery and grading, not the channel.
  multiple_choice_group: {
    input: 'text',
    output: 'none',
    focus: [],
    form: 'bank',
    modality: 'recognition',
  },

  // Retired in favour of `word_bank_gap_fill`, still 135 exercises. Typed into the gap
  // with nothing on offer, so the learner produces the form. The sentence around the gap
  // is the frame of the answer, not material to understand — `input: 'none'`.
  fill_in_blank: { input: 'none', output: 'written_target', focus: [], form: 'free', modality: 'recall' },

  // Retired. Words come from a bank, so nothing is produced — the learner recognises
  // which given word fits. That is reading, not writing, however sentence-shaped the
  // result looks on screen.
  word_bank_fill: { input: 'text', output: 'none', focus: [], form: 'bank', modality: 'recognition' },

  // The one template whose document genuinely decides: it absorbed `fill_in_blank`, so
  // `settings.input` is `bank` (choose from a strip) or `free` (type it). Both the skill
  // and the form follow from that, which is why `derive.ts` reads the document here: the
  // row stands for the `free` half, and `bank` turns it into `text → none`.
  // The modality follows the same flag and is left `unknown` here for the same reason —
  // a table that guessed would be wrong for half the catalogue in either direction.
  word_bank_gap_fill: {
    input: 'none',
    output: 'written_target',
    focus: [],
    form: 'mixed',
    modality: 'unknown',
  },

  // Ordering given sentences into a coherent text. Everything is on screen; the work is
  // following the thread of the text. Cohesion is arguably `pragmatics`, but that is a
  // reading of the type rather than a property of it — rule 2, no hint.
  // Recognition, and this is the harder of the two ordering types to place: the cues that
  // settle the order are printed in the sentences themselves, so nothing has to be
  // retrieved. Contrast `sentence_schema` below.
  text_order: { input: 'text', output: 'none', focus: [], form: 'bank', modality: 'recognition' },

  // Two moves in one: spot what is wrong (reading, closely) and write the correction
  // (written). The focus hint is the one case where the premise of the type *is* the
  // subject — an exercise built around a broken form is about form.
  // `recall`: the correct form comes from memory, but the sentence around it is given —
  // the learner is not composing, they are repairing.
  error_correction: {
    input: 'text',
    output: 'written_target',
    focus: ['grammar'],
    form: 'free',
    modality: 'recall',
  },

  // Produces target-language sentences from nothing. Rule 1 in its clearest form: the
  // source sentence is in the language of explanation, so nothing is read in the
  // language being learnt.
  translate_to_target: {
    input: 'none',
    output: 'written_target',
    focus: [],
    form: 'free',
    modality: 'production',
  },

  // The mirror image, and *not* a mirror of the axis: the learner reads the target
  // language and answers in the language of explanation. Understanding is what is being
  // exercised; the writing happens in a language nobody is measuring. Rule 1.
  // `recall`, not `production`: the meaning is retrieved from memory with nothing on
  // offer, but the language produced is not the one being learnt.
  translate_from_target: {
    input: 'text',
    output: 'written_l1',
    focus: [],
    form: 'free',
    modality: 'recall',
  },

  // Both halves are on screen and the work is recognising which belongs with which.
  // The focus hint is a judgement about the dominant use — word against meaning — and is
  // the row most likely to be overridden by an author, which is exactly what the
  // override column is for.
  match_pairs: {
    input: 'text',
    output: 'none',
    focus: ['vocabulary'],
    form: 'bank',
    modality: 'recognition',
  },

  // Reads a text, answers in a sentence or three of their own. Both channels, and the
  // strongest evidence in `evidence-strength.ts` for the same reason — and `production`,
  // which is the same judgement on a second axis.
  short_answer: {
    input: 'text',
    output: 'written_target',
    focus: [],
    form: 'free',
    modality: 'production',
  },

  // A whole text, produced. No source to read: the prompt is an instruction, not
  // material — `input: 'none'`.
  writing_task: {
    input: 'none',
    output: 'written_target',
    focus: [],
    form: 'free',
    modality: 'production',
  },

  // Chunks are dragged into fields — given pieces, arranged. The learner does not spell
  // anything, so the form is `bank`, but the channel is written production: what is being
  // built is a sentence in the target language, and word order is the whole point. Hence
  // the one unambiguous grammar hint in the table. The chunks on screen are pieces of the
  // answer, not a text to understand, so the input is `none`, as for a gap fill.
  // `recall` despite `bank`, and the two columns are not saying different things: the
  // pieces are given, the order is not, and nothing on screen tells the learner where the
  // finite verb goes. That has to come from the rule they are supposed to have learnt.
  sentence_schema: {
    input: 'none',
    output: 'written_target',
    focus: ['grammar'],
    form: 'bank',
    modality: 'recall',
  },

  // Items placed into labelled buckets (plan 66). The tiles have to be read and understood
  // to be placed — `en`, `ei` or `et` is decided by knowing the word — so the input is
  // `text`; nothing is written, so the output is `none`. Every answer is on screen as a
  // labelled zone and the learner picks one: `recognition`, however much rule-applying goes
  // into the pick. The handoff calls this `retrieval: recombine`; that axis became
  // `modality` in plan 64 (decision G), and recombining given pieces is still choosing
  // among them — contrast `sentence_schema`, where the order has to come from memory.
  // No focus hint (rule 2): gender and verb class are grammar, formal against informal is
  // pragmatics, a meaning field is vocabulary, and only the author knows which was built.
  // Plan 66 Q1-A keeps it that way — the subject comes from the atoms the items address,
  // or from the author's override, not from a field in the document.
  sort_into_buckets: {
    input: 'text',
    output: 'none',
    focus: [],
    form: 'bank',
    modality: 'recognition',
  },

  // Words marked in a passage (plan 67). Recognition — but over a text, not a list of
  // options: the candidate set is every word in the passage, not four buttons, so the
  // learner has to *find* the feature in running prose before pointing at it. The input is
  // `text` (a continuous passage has to be read), nothing is written (`none`), and every
  // answer is already on screen to be picked (`bank`, `recognition`). The handoff calls this
  // `retrieval: select`; that axis became `modality` in plan 64 (decision G). It adds to
  // the share of recognition where recognition is already heavy — the coverage card says
  // so instead of letting it pass. No focus hint (rule 2): «mark the preterite» is grammar,
  // «mark what refers to the weather» is vocabulary, and only the author knows which was
  // built — plan 66 Q1-A, carried over as deviation 14 of plan 67.
  highlight_in_text: {
    input: 'text',
    output: 'none',
    focus: [],
    form: 'bank',
    modality: 'recognition',
  },

  // A recording written down a sentence at a time (plan 68). The only type that closes the
  // orthography axis: nothing is offered, so the candidate set is the language — every letter
  // the learner puts down is their own, and the diff names what went wrong by class
  // (diacritic, case, a dropped word). Hence the one structural focus hint besides grammar
  // in the table (rule 2): the type cannot be about anything but spelling what was heard,
  // whatever sentences the author chose. The input is `audio` on the bare template, not
  // only through the layer — the recording is not an option here, it is the material, and
  // the document cannot switch it off (README: «audio is on and cannot be turned off»).
  // `written_target` and `free`: the words are typed into an empty field. `recall`, not
  // `production`: the sentence is given by ear, and the work is putting the heard form on
  // paper, not composing one — the same line `error_correction` draws.
  dictation: {
    input: 'audio',
    output: 'written_target',
    focus: ['orthography'],
    form: 'free',
    modality: 'recall',
  },
};

/** `undefined` for a code the table does not know — a new template, or a typo. */
export function templateProfile(templateCode: string): TemplateProfile | undefined {
  return BY_TEMPLATE[templateCode];
}
