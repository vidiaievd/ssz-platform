import {
  readQuestionStates,
  TEMPLATE_CODE as HIGHLIGHT_IN_TEXT,
} from '@ssz/shared-kernel/highlight-in-text';
import type { QuestionState } from '@ssz/shared-kernel/highlight-in-text';
import {
  readSegmentStates,
  TEMPLATE_CODE as DICTATION,
} from '@ssz/shared-kernel/dictation';
import type { SegmentState } from '@ssz/shared-kernel/dictation';

/**
 * The templates answered one item per submit inside one attempt (plan 67, Q1-A), and where
 * each keeps the state of its items.
 *
 * `highlight_in_text` answers a question per submit, `dictation` a sentence (plan 68 §3.4).
 * Both carry every item's state — checks spent, the first check (the evidence), closed,
 * revealed — in the attempt's own details: the validator writes all of it on every submit,
 * the submit handler reads it back from there and writes it over the next submission, and a
 * resumed attempt hands it to the runner. Nothing of it is the client's to state. The two
 * differ only in the field and the shape of an item, which is what this table says; the
 * kernel's reader is the one that knows the shape, and it never throws.
 *
 * `throttled` — the grader refuses a second check of an item too soon after the first
 * (`dictation`, decision Q4-A of plan 68), so the server's clock goes in with the states.
 */
interface ItemStates {
  /** The field of the validator's details, and of the submission, that holds them. */
  field: string;
  read: (value: unknown) => unknown[];
  throttled: boolean;
}

const ITEM_STATES: ReadonlyMap<string, ItemStates> = new Map([
  [HIGHLIGHT_IN_TEXT, { field: 'questions', read: readQuestionStates, throttled: false }],
  [DICTATION, { field: 'segments', read: readSegmentStates, throttled: true }],
]);

/** Is this template answered item by item inside one attempt. */
export function isItemByItem(templateCode: string): boolean {
  return ITEM_STATES.has(templateCode);
}

/** The item states a set of details carries; none for any other template. */
function statesIn(templateCode: string, details: unknown): unknown[] {
  const entry = ITEM_STATES.get(templateCode);
  if (!entry || typeof details !== 'object' || details === null) return [];
  return entry.read((details as Record<string, unknown>)[entry.field]);
}

interface AttemptLike {
  templateCode: string;
  validationDetails: unknown;
}

/** The item states the last submit left on the attempt — none before the first. */
export function itemStatesOf(attempt: AttemptLike): unknown[] {
  return statesIn(attempt.templateCode, attempt.validationDetails);
}

/** A `highlight_in_text` attempt's question states; none for any other template. */
export function questionStatesOf(attempt: AttemptLike): QuestionState[] {
  return attempt.templateCode === HIGHLIGHT_IN_TEXT ? (itemStatesOf(attempt) as QuestionState[]) : [];
}

/** A `dictation` attempt's segment states; none for any other template. */
export function segmentStatesOf(attempt: AttemptLike): SegmentState[] {
  return attempt.templateCode === DICTATION ? (itemStatesOf(attempt) as SegmentState[]) : [];
}

/** The item states a validator's details carry, keyed by item id with the first verdict. */
export function firstVerdictsIn(
  templateCode: string,
  details: unknown,
): Array<{ gapKey: string; correct: boolean }> | undefined {
  const states = statesIn(templateCode, details) as Array<{
    questionId?: string;
    segmentId?: string;
    firstPassed: boolean | null;
  }>;
  if (states.length === 0) return undefined;
  return states.map((st) => ({
    gapKey: (st.questionId ?? st.segmentId) as string,
    correct: st.firstPassed === true,
  }));
}

/**
 * An item-by-item submission with the attempt's own facts written over it.
 *
 * The record of every item (the budget is per item, the evidence is each item's first
 * check), the mode — a graded attempt gives each item one check, no hint and no reveal
 * (plan 67, Q8-A), and a client that could leave `graded` off would buy itself the practice
 * budget — and, for a throttled template, the time of this submit. What stays the client's
 * is the item it is answering, its answer, and «Vis fasit».
 */
export function withRecordedItems(
  attempt: AttemptLike & { checkMode: string },
  submitted: unknown,
  now: Date,
): unknown {
  const entry = ITEM_STATES.get(attempt.templateCode);
  if (!entry) return submitted;
  const base =
    typeof submitted === 'object' && submitted !== null && !Array.isArray(submitted)
      ? (submitted as Record<string, unknown>)
      : {};
  return {
    ...base,
    [entry.field]: itemStatesOf(attempt),
    graded: attempt.checkMode === 'GRADED',
    ...(entry.throttled ? { now: now.getTime() } : {}),
  };
}
