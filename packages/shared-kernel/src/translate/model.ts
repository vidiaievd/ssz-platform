// Model for the `translate_to_target` / `translate_from_target` exercises.
//
// Source of truth: docs/design/activity-specs/design_handoff_translate/DATA_MODEL.md
// in ssz-platform-web, as amended by the decisions in docs/plan/42-translate.md.
//
// The governing rule, from the handoff: **the auto-check can only ever approve.** A
// translation that does not match the key may still be a perfectly good translation the
// author never thought of, so the single automatic outcome is a hit on a variant of the
// key. Everything else is a diff and a sort order for a human — which is why `Routing`
// has two members and only one of them is reachable without a teacher.
//
// The second rule: an exercise is a *set* of sentences with one submission. The type it
// replaces held exactly one sentence and no set, and every count in the builder (variants,
// coverage, explanations) exists because a set is where authoring quality stops being
// visible by eye.

/** Which way one sentence is translated. `both` is a property of the set, not an item. */
export type ItemDirection = 'to_target' | 'from_target';

export type Direction = ItemDirection | 'both';

/** `single` renders one sentence; `set` renders many with one submission. */
export type Format = 'single' | 'set';

/** Language labels. Free text — these are shown to the student, not matched on. */
export interface Langs {
  /** The language the course explains in. */
  explain: string;
  /** The language being learnt. Defaults to Norwegian. */
  target: string;
}

/** A word the author glosses for the student, e.g. `{ w: "уже", t: "allerede / nå" }`. */
export interface Gloss {
  w: string;
  t: string;
}

/**
 * A substring the answer must (or must not) contain, with the explanation shown when it
 * fires.
 *
 * The explanation lives here rather than on the item because a fired guard is the only
 * deviation this engine can name exactly: "the task asks for «har bodd»" is a true
 * statement about the task, unlike anything the diff could say about a translation.
 */
export interface Guard {
  text: string;
  /** Shown to the student the moment the guard fires. Optional by design. */
  note?: string;
}

export interface Item {
  /** Stable, generated client-side. */
  id: string;
  /** Read only when the exercise's `dir` is `both`. */
  dir: ItemDirection;
  /** The sentence the student reads. */
  source: string;
  /**
   * Accepted translations. `refs[0]` is the primary one — shown first to the teacher and
   * to the student when the key is revealed — but all of them score equally.
   *
   * Each may carry inline alternatives: `"Jeg (liker|elsker) katter"` expands to two
   * sentences, `"Jeg bor her (nå|)"` makes the last word optional.
   */
  refs: string[];
  /** The student opens it themselves. */
  hint?: string;
  gloss: Gloss[];
  /** Audio of `source`. Only meaningful when the source is in the target language. */
  mediaId?: string;
  /** Substrings the answer must contain. */
  require: Guard[];
  /** Substrings the answer must not contain. */
  forbid: Guard[];
  /** Why the key reads the way it does. Shown with the key, per `flow.showRefs`. */
  explanation?: string;
  /** Only ever shown in the teacher queue. */
  teacherNote?: string;
}

/** What the machine accepts. */
export interface Check {
  on: boolean;
  /** On by default: capitalisation is rarely what a translation exercise trains. */
  caseInsensitive: boolean;
  /** On by default, same reason. */
  ignorePunct: boolean;
  /**
   * `æ→a`, `ø→o`, `å→a`. Off by default and warned about: with it on, "bla" passes for
   * "blå" and a real spelling mistake becomes invisible.
   */
  foldDiacritics: boolean;
  /** One letter's difference in a word of 4+ characters still counts as a hit. */
  typo: boolean;
  /** Similarity from which an answer is called `near` rather than `off`. */
  near: number;
  /** A hit on a variant of the key passes without a teacher. */
  exactPass: boolean;
}

export type AttemptsPolicy = 'free' | 'once';
export type ShowRefsPolicy = 'afterSubmit' | 'afterGraded' | 'never';

/** How the exercise is run. */
export interface Flow {
  /** Self-checks allowed before submitting, 0–5. */
  selfCheck: number;
  attempts: AttemptsPolicy;
  showRefs: ShowRefsPolicy;
  /** Offer æ ø å. */
  keyboard: boolean;
  /** Show the author's glosses. */
  gloss: boolean;
  charCount: boolean;
  /**
   * How many times attached audio may be replayed; `null` is unlimited, which is the
   * only value anything sets. Carried so that a listening template can turn it on
   * without a content migration.
   *
   * Deliberately unenforced, and closed as such (plan 42, "Отложенное — закрыто"):
   * counting replays in the browser produces a limit a page reload lifts, and a limit
   * that can be lifted is worse than none, since it tells the learner a lie about what
   * is being measured. Honouring it means counting replays server-side against the
   * attempt — which is worth building for a template where replaying *is* the thing
   * under test, and translation is not that template. Neither the runner nor the
   * builder reads this field until then.
   */
  replayLimit: number | null;
}

export type AiVisibility = 'teacher' | 'studentBefore' | 'studentAfter';

/**
 * The AI stage. Carried from the first commit so that connecting a model later needs no
 * migration, exactly as `error_correction` carries its own. Nothing here triggers a model
 * call, and the handoff requires every AI surface to stay inert until one is wired up.
 *
 * Wiring one up is plan 48, not the tail of plan 42: the platform holds no model client
 * at all, so the first one brings decisions — where the call lives, who pays for it, what
 * happens when it fails — that outlive this template. Until then this block is an author's
 * setting that changes nothing, and it is kept out of the learner's projection.
 */
export interface Ai {
  on: boolean;
  checks: { grammar: boolean; order: boolean; lexis: boolean; register: boolean };
  visibility: AiVisibility;
}

export const DEFAULT_CHECK: Check = {
  on: true,
  caseInsensitive: true,
  ignorePunct: true,
  foldDiacritics: false,
  typo: true,
  near: 0.8,
  exactPass: true,
};

export const DEFAULT_FLOW: Flow = {
  selfCheck: 2,
  attempts: 'free',
  showRefs: 'afterGraded',
  keyboard: true,
  gloss: true,
  charCount: false,
  replayLimit: null,
};

export const DEFAULT_AI: Ai = {
  on: true,
  checks: { grammar: true, order: true, lexis: true, register: false },
  visibility: 'studentBefore',
};

/**
 * The task itself. Separated from the full document because it is close to what the
 * `content` column holds — see persistence.ts, which lifts the answer key out of `items`.
 */
export interface TranslateTask {
  dir: Direction;
  langs: Langs;
  format: Format;
  /** Context for the student, shown before submitting. */
  note: string;
  items: Item[];
  check: Check;
  flow: Flow;
  ai: Ai;
}

/**
 * The stored template codes. `both` is stored under `translate_to_target` (plan 42,
 * decision 3): the catalogue, the SRS weights and the mobile client all key off these two
 * strings, and a third code would buy analytics precision at the price of touching all of
 * them.
 */
export type TranslateType = 'translate_to_target' | 'translate_from_target';

export const TRANSLATE_TYPES: readonly TranslateType[] = [
  'translate_to_target',
  'translate_from_target',
];

export interface Translate extends TranslateTask {
  id: string;
  type: TranslateType;
  moduleId: string;
  /** Teachers and the module list only. */
  title: string;
  /** The one line the student reads first. */
  instructions: string;
  /** ISO. Doubles as the autosave concurrency token. */
  updatedAt: string;
}

/** How well the submitted sentence matched. The ladder is ordered best to worst. */
export type Verdict = 'exact' | 'typo' | 'near' | 'off' | 'empty' | 'noref';

/** Where a judged answer goes. `pass` is reachable from `exact` alone. */
export type Routing = 'pass' | 'teacher';

/**
 * One word of the diff against the closest variant of the key.
 *
 * `eq` matched, `extra` exists only in the answer, `missing` only in the key. `typo`
 * holds the key's spelling when an `eq` was reached by allowing one letter's difference.
 */
export interface DiffToken {
  t: 'eq' | 'extra' | 'missing';
  w: string;
  typo: string | null;
}

export interface Diff {
  tokens: DiffToken[];
  /** `2·LCS / (|answer| + |key|)`. 1.0 is identical. */
  sim: number;
  /** Tokens that are not `eq` — the handoff's `order` count. */
  edits: number;
}

/** A guard that fired, carried with the explanation the author attached to it. */
export interface GuardHit {
  text: string;
  note?: string;
}

export interface Judgement {
  verdict: Verdict;
  sim: number;
  tokens: DiffToken[];
  /** The variant the answer was compared against — the closest one by `sim`. */
  ref: string;
  /** `require` entries the answer does not satisfy. */
  missing: GuardHit[];
  /** `forbid` entries the answer trips. */
  banned: GuardHit[];
  exact: boolean;
}

/**
 * Authoring coverage, for the builder's step-2 and step-3 numbers.
 *
 * `variants` predicts how much manual work the teacher inherits: an item with one accepted
 * sentence sends nearly every correct answer to the queue. `explained` and
 * `guardsExplained` are the error-analysis scale of plan 42 — neither gates publishing.
 */
export interface Coverage {
  /** Items with a source sentence. */
  items: number;
  /** Items that have at least one answer key. */
  withRef: number;
  /** Items accepting more than one variant. */
  multiVariant: number;
  /** Accepted variants across all items, after expansion. */
  variants: number;
  /** Items carrying an author explanation. */
  explained: number;
  /** `require` + `forbid` entries across all items. */
  guards: number;
  /** Guards carrying an explanation. */
  guardsExplained: number;
}
