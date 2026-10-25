/**
 * The rules every `review_direct` prompt ends with: the ruling, the outcome and the summary.
 * The template's own rules say what a remark is; these say what the learner's work counts as.
 */

/** The opening of a direct prompt: who reads the review, and who else may. `work` names the exercise. */
export type Framing = (work: string) => string[];

/**
 * Whose learner the review is for (plan 80, step 3d) — read off the payer of the call: a
 * school pays for its learners' reviews, a learner studying alone for their own.
 */
export type ReviewAudience = 'self_study' | 'school';

/**
 * The opening for a learner studying alone (`review_direct@1`, and `@2` for that audience):
 * nobody stands between the review and the learner. `work` names the exercise ("a translation
 * exercise").
 */
export function directFraming(work: string): string[] {
  return [
    `You review ${work} for a learner who studies without a teacher. Nobody checks your review: it reaches`,
    'the learner as you write it, marked as checked by AI, and your verdict decides whether the work counts.',
    'Be right rather than thorough: a wrong remark or a wrong verdict teaches the learner something false.',
  ];
}

/**
 * The opening for a school's learner (`review_direct@2`, plan 80): the learner still reads the
 * review first and unchecked, but a teacher may read the work after it, and the verdict counts
 * by itself only if none does in time. The same demand for being right — the learner has
 * already read it by the time anyone else does.
 */
export function schoolFraming(work: string): string[] {
  return [
    `You review ${work} for a learner of a school. The learner reads your review at once, marked as checked`,
    'by AI, before any teacher does. A teacher of the school may read the work later and give their own',
    'verdict; if none does within the school\'s term, your verdict decides whether the work counts.',
    'Be right rather than thorough: a wrong remark or a wrong verdict teaches the learner something false.',
  ];
}

export function framingFor(audience: ReviewAudience): Framing {
  return audience === 'school' ? schoolFraming : directFraming;
}

/**
 * The ruling by decisions: one per sentence. `item` names what is decided ("answer",
 * "corrected sentence"); `acceptable` is the template's own reading of "acceptable".
 */
export function decisionRules(item: string, acceptable: string[]): string[] {
  return [
    '',
    'Verdict. Rules:',
    `- \`decisions\`: for every sentence, \`sentence_N\` is true when its ${item} is acceptable, false when it`,
    '  is not. Acceptable means:',
    ...acceptable.map((line) => `  ${line}`),
    `- Decide each ${item} on what is written, not on what the learner probably meant. The decisions agree`,
    '  with your remarks: a sentence you leave without a remark is not false for a reason you kept to yourself.',
    `- An empty ${item} is false.`,
    '- `outcome` is `returned` when the learner should do the work again: most of it is wrong, or it does not',
    '  attempt the task. Otherwise `approved` — mistakes in some sentences are what the decisions are for.',
  ];
}

/** The ruling by marks: an essay marked by the rubric of its task. */
export function markRules(commentLanguage: string): string[] {
  return [
    '',
    'Verdict. The text is marked by the `rubric` of the task, and your marks are its result. Rules:',
    '- For every criterion, `criterion_N` (N its number): `mark` the level 0-3 whose descriptor in `levels`',
    `  is most true of this text, and \`reason\` — one sentence in ${commentLanguage}, addressed to the`,
    '  learner, naming what in the text decides the level.',
    '- Mark the text that is there against the descriptor — not the effort, not what the learner probably',
    '  meant. Do not round up to be kind or down to be safe; when two levels fit, take the one whose',
    '  descriptor is fully true.',
    '- `weight` says how much a criterion counts in the total. It never changes which level fits.',
    '- Marks do not follow from the number of remarks: the remarks are capped and skip matters of taste,',
    '  a mark reads the whole text.',
    '- `outcome` is `returned` when the text should be written again: it does not attempt the task, or is',
    '  too short or unreadable to mark. Otherwise `approved`.',
  ];
}

/** The summary: required, because nobody else will write one. */
export function summaryRules(commentLanguage: string): string[] {
  return [
    `- \`summary\`: two or three sentences in ${commentLanguage}, addressed to the learner, on the work as a`,
    '  whole — what is good and what to work on next. When `outcome` is `returned`, it says why the work',
    '  comes back and what to do differently. Never empty.',
  ];
}
