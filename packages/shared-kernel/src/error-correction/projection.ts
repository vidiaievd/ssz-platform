// What a student is allowed to see — BEHAVIOR.md §C.1: "the student must never see
// *which* words are wrong before grading, only how many mistakes are left".
//
// Both directions of that rule live here. `toStudentProjection` is what the server sends
// when an attempt starts; `selfCheckFeedback` is what it may answer during the attempt.
// Neither can leak the key by accident, because neither is handed the key in a form it
// could pass on: everything they return is a count, a type, or text the author wrote for
// the student to read.

import type {
  Check,
  Flow,
  Hints,
  Item,
  Mode,
  SpanType,
  StudentEdits,
} from './model.js';
import { hardSpans, judge, words } from './engine.js';

/** One item as the runner receives it. */
export interface ProjectedItem {
  id: string;
  /** The faulty sentence, as written. */
  wrong: string;
  /**
   * The same sentence tokenised. Sent rather than left to the client because every index
   * in a `StudentEdits` points into this array — if the two sides tokenised differently,
   * an edit would land on the wrong word and no error would say so.
   */
  words: string[];
  /** Only when `hints.hintText`. */
  hint?: string;
  /** Hard spans in this item. Only when `hints.count`. */
  errorCount?: number;
  /** Types of the hard spans, in sentence order. Only when `hints.showType`. */
  errorTypes?: SpanType[];
}

/** The parts of `flow` that change what the runner renders. */
export interface ProjectedFlow {
  selfCheck: number;
  attempts: Flow['attempts'];
  showRefs: Flow['showRefs'];
  keyboard: boolean;
  showSpanCount: boolean;
}

export interface StudentProjection {
  mode: Mode;
  note: string;
  items: ProjectedItem[];
  hints: Hints;
  flow: ProjectedFlow;
  /** Across all items. Only when `hints.count`. */
  totalErrors?: number;
}

/**
 * Build the student's view of the exercise.
 *
 * `items` here are the full items, answer key included — this function is the thing that
 * takes the key away, so it has to be given it. Call it on the server only.
 */
export function toStudentProjection(
  task: { mode: Mode; note: string; items: Item[]; hints: Hints; check: Check; flow: Flow },
): StudentProjection {
  const { hints, check } = task;

  const items = task.items.map((item): ProjectedItem => {
    const spans = hardSpans(item, check);
    return {
      id: item.id,
      wrong: item.wrong,
      words: words(item.wrong),
      ...(hints.hintText && item.hint !== undefined && item.hint !== '' ? { hint: item.hint } : {}),
      ...(hints.count ? { errorCount: spans.length } : {}),
      ...(hints.showType ? { errorTypes: spans.map((span) => span.type) } : {}),
    };
  });

  return {
    mode: task.mode,
    note: task.note,
    items,
    hints,
    flow: {
      selfCheck: task.flow.selfCheck,
      attempts: task.flow.attempts,
      showRefs: task.flow.showRefs,
      keyboard: task.flow.keyboard,
      showSpanCount: task.flow.showSpanCount,
    },
    ...(hints.count
      ? { totalErrors: task.items.reduce((sum, item) => sum + hardSpans(item, check).length, 0) }
      : {}),
  };
}

/** What one item's self-check may report. */
export interface SelfCheckItem {
  itemId: string;
  /** How many mistakes are corrected so far. */
  fixedCount: number;
  spanCount: number;
  /**
   * Which mistakes are still open, as a list of booleans in sentence order — the pips of
   * `flow.showSpanCount`. A pip says *that* a mistake is unfixed, never where it is.
   */
  fixedSpans: boolean[];
  /** Types of the mistakes not yet corrected. Only when `hints.showType`. */
  remainingTypes?: SpanType[];
  /**
   * The student changed something where there was no mistake. Said out loud because it
   * is otherwise the commonest silent reason for a rejection.
   */
  strayEdits: number;
}

export interface SelfCheckFeedback {
  items: SelfCheckItem[];
  fixedCount: number;
  spanCount: number;
}

/**
 * The self-check, BEHAVIOR.md §B: the student learns *how many* mistakes are corrected,
 * never which words remain.
 *
 * Deliberately not a verdict. Returning one would be the auto-check rejecting an answer,
 * which this template never does — and before submission it would also be a free extra
 * attempt.
 */
export function selfCheckFeedback(
  task: { items: Item[]; check: Check; hints: Hints },
  edits: Record<string, StudentEdits>,
): SelfCheckFeedback {
  const items = task.items.map((item): SelfCheckItem => {
    const judgement = judge(task.check, item, edits[item.id]);
    const fixedSpans = judgement.spans.map((span) => span.state === 'fixed');
    const remaining = judgement.spans.filter((span) => span.state !== 'fixed');

    return {
      itemId: item.id,
      fixedCount: judgement.fixedCount,
      spanCount: judgement.spanCount,
      fixedSpans,
      ...(task.hints.showType ? { remainingTypes: remaining.map((span) => span.type) } : {}),
      strayEdits: judgement.stray.length,
    };
  });

  return {
    items,
    fixedCount: items.reduce((sum, item) => sum + item.fixedCount, 0),
    spanCount: items.reduce((sum, item) => sum + item.spanCount, 0),
  };
}
