// Which explanation a wrong placement earns — the handoff's `ssFbFor`.
//
// Resolution order, from README: `row.fb[chunkId]` → a default for the kind of mistake →
// `row.why`. From attempt 2, `settings.hintAfterMistake` appends `row.why` underneath.
//
// The kernel returns a **source and a code**, never a sentence. The handoff writes the
// defaults as English prose ("Right field, wrong order inside it."); the platform renders
// student copy in four languages, so prose in shared logic could not be shown to anyone
// (plan 52 §5, the same rule as short_answer and writing_task).
//
// Why the fallback chain ends at `row.why` rather than at silence: the rule is written
// once and does three jobs — it is shown on success, it is the last-resort explanation
// here, and it is the escalating hint. That is why `why` is a blocker in issues.ts and
// why its copy has to explain the structure rather than praise the student.

import type { GradeResult, ItemMark } from './grading.js';
import type { Row, Settings } from './model.js';

export type FeedbackSource = 'override' | 'default' | 'why';

export interface Feedback {
  source: FeedbackSource;
  /** The author's words, for `override` and `why`. Empty for `default`. */
  text: string;
  /** Which default message to render. Set only when `source === 'default'`. */
  code: ItemMark | null;
  /** `row.why` repeated under the message from attempt 2. Empty when it does not apply. */
  hint: string;
}

/**
 * The explanation for one wrongly placed item.
 *
 * `attempt` is 1-based: the first check is attempt 1, and the hint escalation starts at 2.
 */
export function feedbackFor(
  row: Row,
  chunkId: string,
  mark: ItemMark,
  settings: Settings,
  attempt: number,
): Feedback {
  const hint = settings.hintAfterMistake && attempt >= 2 ? row.why : '';

  const override = row.fb[chunkId];
  if (override && override.trim() !== '') {
    return { source: 'override', text: override, code: null, hint };
  }
  // `order` and `extra` have a default worth showing: they name a mistake the student can
  // act on without knowing the rule. A wrong *field* has none — knowing it is the wrong
  // field is not knowing which is right — so it falls through to the rule itself.
  if (mark === 'order' || mark === 'extra') {
    return { source: 'default', text: '', code: mark, hint };
  }
  return { source: 'why', text: row.why, code: null, hint };
}

/**
 * The one message shown under the board after a check.
 *
 * Picks the first wrong item in the order the row reads, so the student is told about the
 * mistake nearest the start of the sentence rather than whichever field was walked first.
 * A solved row returns the rule as the success message — the handoff shows `row.why` on
 * success too, and that is the point of writing it as an explanation.
 */
export function bannerFor(
  row: Row,
  marks: GradeResult,
  settings: Settings,
  attempt: number,
): Feedback | null {
  if (marks.solved) return { source: 'why', text: row.why, code: null, hint: '' };

  for (const chunk of row.chunks) {
    const mark = marks.byItem[chunk.id];
    if (mark && mark !== 'ok') return feedbackFor(row, chunk.id, mark, settings, attempt);
  }
  // Nothing of the sentence is wrong, so what is wrong is a distractor or an empty field.
  const strayId = Object.keys(marks.byItem).find((id) => marks.byItem[id] === 'extra');
  if (strayId) return feedbackFor(row, strayId, 'extra', settings, attempt);
  if (marks.wrong > 0) return { source: 'why', text: row.why, code: null, hint: '' };
  return null;
}
