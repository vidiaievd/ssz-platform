// What a student is allowed to see — BEHAVIOR.md, "Само-проверка": the self-check
// teaches, it does not hand over the key.
//
// Both directions of that rule live here. `toStudentProjection` is what the server sends
// when an attempt starts; `selfCheckFeedback` is what it may answer during the attempt.
//
// The one rule worth stating twice: in the working phase, `missing` words of the diff are
// replaced by `•••`. A student who can run the self-check three times against a visible
// `missing` list can reconstruct the key one word at a time, and the exercise becomes a
// typing test. The exception is `showRefs: 'afterSubmit'`, where the key is about to be
// shown anyway and hiding it buys nothing.

import type {
  Check,
  Direction,
  DiffToken,
  Flow,
  Format,
  Gloss,
  GuardHit,
  Item,
  ItemDirection,
  Judgement,
  Langs,
  TranslateTask,
  Verdict,
} from './model.js';
import { itemDirection, judge, route, runItems } from './engine.js';

/** The placeholder that stands in for a word of the key. */
export const MASK = '•••';

/** One item as the runner receives it. */
export interface ProjectedItem {
  id: string;
  /** Resolved: the runner never has to know whether the set is mixed. */
  dir: ItemDirection;
  /** The sentence the student reads. */
  source: string;
  /** The language of `source`, as a label. */
  sourceLang: string;
  /** The language the answer is written in, as a label. */
  answerLang: string;
  /** Only when the author wrote one — the student opens it themselves. */
  hint?: string;
  /** Only when `flow.gloss`. */
  gloss?: Gloss[];
  /** Audio of `source`. */
  mediaId?: string;
}

/** The parts of `flow` that change what the runner renders. */
export interface ProjectedFlow {
  selfCheck: number;
  attempts: Flow['attempts'];
  showRefs: Flow['showRefs'];
  keyboard: boolean;
  gloss: boolean;
  charCount: boolean;
  replayLimit: number | null;
}

export interface StudentProjection {
  dir: Direction;
  langs: Langs;
  format: Format;
  note: string;
  items: ProjectedItem[];
  flow: ProjectedFlow;
  /**
   * Whether a hit on the key closes an item without a teacher. The runner says so under
   * the submit button, and it must not have to infer it from settings it cannot see.
   */
  exactPasses: boolean;
}

/**
 * Build the student's view of the exercise.
 *
 * `items` here are the full items, answer key included — this function is the thing that
 * takes the key away, so it has to be given it. Call it on the server only.
 */
export function toStudentProjection(task: TranslateTask): StudentProjection {
  const items = runItems(task).map((item): ProjectedItem => {
    const dir = itemDirection(task, item);
    return {
      id: item.id,
      dir,
      source: item.source,
      sourceLang: dir === 'from_target' ? task.langs.target : task.langs.explain,
      answerLang: dir === 'from_target' ? task.langs.explain : task.langs.target,
      ...(item.hint !== undefined && item.hint !== '' ? { hint: item.hint } : {}),
      ...(task.flow.gloss && item.gloss.length > 0 ? { gloss: item.gloss } : {}),
      ...(item.mediaId !== undefined && item.mediaId !== '' ? { mediaId: item.mediaId } : {}),
    };
  });

  return {
    dir: task.dir,
    langs: task.langs,
    format: task.format,
    note: task.note,
    items,
    flow: {
      selfCheck: task.flow.selfCheck,
      attempts: task.flow.attempts,
      showRefs: task.flow.showRefs,
      keyboard: task.flow.keyboard,
      gloss: task.flow.gloss,
      charCount: task.flow.charCount,
      replayLimit: task.flow.replayLimit,
    },
    exactPasses: task.check.on && task.check.exactPass,
  };
}

/** What one item's self-check may report. */
export interface SelfCheckItem {
  itemId: string;
  verdict: Verdict;
  /** Similarity to the closest variant, 0…1. Shown as a bar, not as a grade. */
  sim: number;
  /**
   * The diff, with the key's words masked unless the key is about to be revealed. Absent
   * for `off`: a diff against a sentence the student did not write is noise, and the
   * handoff shows a count of diverging words instead.
   */
  tokens?: DiffToken[];
  /** Only for `off` — how many words differ from the closest variant. */
  divergingWords?: number;
  /** `require` entries not satisfied, with the author's explanation of each. */
  missing: GuardHit[];
  /** `forbid` entries tripped, with the author's explanation of each. */
  banned: GuardHit[];
}

export interface SelfCheckFeedback {
  items: SelfCheckItem[];
  /** Items a hit on the key would close on its own, as things stand. */
  passing: number;
}

/**
 * The self-check, BEHAVIOR.md: the student learns how close the answer is to the key and
 * which rules of the task are unmet — never which words are missing.
 *
 * Guard hits are reported in full, explanation included, because they are statements
 * about the *task* ("the task asks for «har bodd»"), not about the key. That is the one
 * place this template can say why something is wrong without inventing a reason.
 */
export function selfCheckFeedback(
  task: { items: Item[]; check: Check; flow: Flow },
  answers: Record<string, string>,
): SelfCheckFeedback {
  const reveal = task.flow.showRefs === 'afterSubmit';

  const items = task.items.map((item): SelfCheckItem => {
    const judgement = judge(task.check, item, answers[item.id] ?? '');
    return {
      itemId: item.id,
      verdict: judgement.verdict,
      sim: judgement.sim,
      ...(judgement.verdict === 'off'
        ? { divergingWords: judgement.tokens.filter((token) => token.t !== 'eq').length }
        : { tokens: reveal ? judgement.tokens : maskMissing(judgement.tokens) }),
      missing: judgement.missing,
      banned: judgement.banned,
    };
  });

  return {
    items,
    passing: task.items.filter(
      (item) => route(task.check, judge(task.check, item, answers[item.id] ?? '')) === 'pass',
    ).length,
  };
}

/** Replace every word of the key the student has not written with a placeholder. */
export const maskMissing = (tokens: DiffToken[]): DiffToken[] =>
  tokens.map((token) => (token.t === 'missing' ? { ...token, w: MASK } : token));

/** One item's outcome, as the submission stores it and the teacher queue reads it. */
export interface ItemOutcome {
  itemId: string;
  verdict: Verdict;
  sim: number;
  /** The variant compared against. Withheld from the student until `flow.showRefs`. */
  ref: string;
  tokens: DiffToken[];
  missing: GuardHit[];
  banned: GuardHit[];
  routing: 'pass' | 'teacher';
}

/**
 * Score a whole submission. The server's authoritative pass — the same call the teacher
 * queue reads back, so the two can never disagree about what was decided.
 */
export function gradeSubmission(
  task: { items: Item[]; check: Check },
  answers: Record<string, string>,
): ItemOutcome[] {
  return task.items.map((item): ItemOutcome => {
    const judgement: Judgement = judge(task.check, item, answers[item.id] ?? '');
    return {
      itemId: item.id,
      verdict: judgement.verdict,
      sim: judgement.sim,
      ref: judgement.ref,
      tokens: judgement.tokens,
      missing: judgement.missing,
      banned: judgement.banned,
      routing: route(task.check, judgement),
    };
  });
}
