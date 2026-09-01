// What each exercise template trains, when nothing more specific is known — plan 55 §3.4,
// bottom rung of the chain.
//
// Written the way `evidence-strength.ts` is written, and for the same reason: **a table
// of judgements must argue for itself.** Every row below says why it holds what it
// holds, because the alternative is a table nobody dares change in a year's time.
//
// Two rules govern the whole table:
//
// 1. **The axis is about the target language.** Producing a sentence in the language of
//    explanation is not written production in the language being learnt. This is what
//    splits the two translate templates: one is `written`, the other is `reading`.
// 2. **A hint is given only where it is structural.** Where a template genuinely could
//    be about vocabulary or about grammar depending on what the author wrote, the focus
//    is left empty rather than guessed. An empty focus is visible in the report as
//    `unknown` and is a truthful statement; a guessed one is noise that cannot be
//    distinguished from a measurement.

import type { Focus, Form, Skill } from './model.js';

export interface TemplateProfile {
  skills: readonly Skill[];
  /** Empty where the template cannot honestly say. See rule 2 above. */
  focus: readonly Focus[];
  /** `mixed` means the document decides — `derive.ts` reads it. */
  form: Form;
}

/**
 * All thirteen template codes of the catalogue, including the two officially retired.
 *
 * `fill_in_blank` and `word_bank_fill` are absorbed by `word_bank_gap_fill` (plan 35) but
 * carry ~135 exercises between them, and the general authoring form still opens them.
 * A coverage report that skipped them would under-count a third of the catalogue.
 */
export const BY_TEMPLATE: Readonly<Record<string, TemplateProfile>> = {
  // Reads a stem, and usually a passage, then recognises the answer among options.
  // Nothing is produced. No focus hint: a set of questions about a text is comprehension,
  // a set about a verb form is grammar, and only the author knows which was written.
  multiple_choice: { skills: ['reading'], focus: [], form: 'bank' },

  // Same channel as the set above; the difference between the two types is the shared
  // column, which changes the unit of delivery and grading, not the channel.
  multiple_choice_group: { skills: ['reading'], focus: [], form: 'bank' },

  // Retired in favour of `word_bank_gap_fill`, still 135 exercises. Typed into the gap
  // with nothing on offer, so the learner produces the form.
  fill_in_blank: { skills: ['written'], focus: [], form: 'free' },

  // Retired. Words come from a bank, so nothing is produced — the learner recognises
  // which given word fits. That is reading, not writing, however sentence-shaped the
  // result looks on screen.
  word_bank_fill: { skills: ['reading'], focus: [], form: 'bank' },

  // The one template whose document genuinely decides: it absorbed `fill_in_blank`, so
  // `settings.input` is `bank` (choose from a strip) or `free` (type it). Both the skill
  // and the form follow from that, which is why `derive.ts` reads the document here.
  word_bank_gap_fill: { skills: ['written'], focus: [], form: 'mixed' },

  // Ordering given sentences into a coherent text. Everything is on screen; the work is
  // following the thread of the text. Cohesion is arguably `pragmatics`, but that is a
  // reading of the type rather than a property of it — rule 2, no hint.
  text_order: { skills: ['reading'], focus: [], form: 'bank' },

  // Two moves in one: spot what is wrong (reading, closely) and write the correction
  // (written). The focus hint is the one case where the premise of the type *is* the
  // subject — an exercise built around a broken form is about form.
  error_correction: { skills: ['reading', 'written'], focus: ['grammar'], form: 'free' },

  // Produces target-language sentences from nothing. Rule 1 in its clearest form.
  translate_to_target: { skills: ['written'], focus: [], form: 'free' },

  // The mirror image, and *not* a mirror of the axis: the learner reads the target
  // language and answers in the language of explanation. Understanding is what is being
  // exercised; the writing happens in a language nobody is measuring. Rule 1.
  translate_from_target: { skills: ['reading'], focus: [], form: 'free' },

  // Both halves are on screen and the work is recognising which belongs with which.
  // The focus hint is a judgement about the dominant use — word against meaning — and is
  // the row most likely to be overridden by an author, which is exactly what the
  // override column is for.
  match_pairs: { skills: ['reading'], focus: ['vocabulary'], form: 'bank' },

  // Reads a text, answers in a sentence or three of their own. Both channels, and the
  // strongest evidence in `evidence-strength.ts` for the same reason.
  short_answer: { skills: ['reading', 'written'], focus: [], form: 'free' },

  // A whole text, produced. No source to read: the prompt is an instruction, not
  // material.
  writing_task: { skills: ['written'], focus: [], form: 'free' },

  // Chunks are dragged into fields — given pieces, arranged. The learner does not spell
  // anything, so the form is `bank`, but the channel is written production: what is being
  // built is a sentence in the target language, and word order is the whole point. Hence
  // the one unambiguous grammar hint in the table.
  sentence_schema: { skills: ['written'], focus: ['grammar'], form: 'bank' },
};

/** `undefined` for a code the table does not know — a new template, or a typo. */
export function templateProfile(templateCode: string): TemplateProfile | undefined {
  return BY_TEMPLATE[templateCode];
}
