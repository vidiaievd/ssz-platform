// What a lesson is expected to train — plan 64 §2б, decisions L–Q.
//
// A recipe is a short list of rules about the axes, never about template codes:
// "at least one element whose output is not `none`", "no more than 60 % of elements
// answered by recognition", "at least one element heard rather than read". Types are
// redefined, retired and added from one plan to the next, so a recipe written as
// "two `fill_in_blank` and one `multiple_choice`" goes stale within a plan — and an
// author who follows it to the letter can still build a lesson that is recognition from
// top to bottom while the recipe reports that all is well. The interface names the types
// that would close a failed rule; the rule itself does not know them (decision L).
//
// **Elements are counted, not exercises** (decision M). A set of eight multiple-choice
// questions is eight acts of recognition, not one; counted per exercise, one of them
// would "balance" one piece of writing. An element is an `ExerciseItemTarget.itemKey` —
// the same unit the subject axis is weighed in (decision H) — and an exercise whose
// elements nobody addressed counts as one.
//
// **Minimums, and shares only as ceilings** (decision N). "At least one" holds in a
// lesson of two elements and in a lesson of twenty; "30 % production" in a lesson of
// three elements is noise. A share is the right word only for balance, which is a ceiling.
//
// **A failed rule is a warning, never a gate** (decision P), on the same terms as
// `issues.ts`: an unbalanced lesson is still a publishable lesson. An empty recipe is a
// legitimate state too — the platform does not impose a method.
//
// Every rule reads `modality` for "how the answer had to be known", not `form` and not
// the `retrieval` axis the plan first proposed: decision G gave that role to `modality`,
// and a recipe in a vocabulary the report does not show would be unverifiable.

import type { AtomRef, DeriveInput, DerivedProfile } from './derive.js';
import { atomFocus, deriveSkills, structuralFocus } from './derive.js';
import type { Focus, Input, Modality, Output, Skill } from './model.js';
import { FOCUSES, INPUTS, MODALITIES, OUTPUTS, SKILLS, orderFocuses } from './model.js';

/** The axes a rule may speak about, and the values each of them takes. */
interface AxisValues {
  input: Input;
  output: Output;
  modality: Modality;
  skill: Skill;
  focus: Focus;
}

export type RecipeAxis = keyof AxisValues;

export const RECIPE_AXES = ['input', 'output', 'modality', 'skill', 'focus'] as const satisfies readonly RecipeAxis[];

const VOCABULARY: { readonly [A in RecipeAxis]: readonly AxisValues[A][] } = {
  input: INPUTS,
  output: OUTPUTS,
  modality: MODALITIES,
  skill: SKILLS,
  focus: FOCUSES,
};

/**
 * Which elements a rule is about.
 *
 * An element matches when its value on the axis is one of `values` — or, with `negate`,
 * when it is none of them. `negate` exists so that "output is not `none`" stays true when
 * a new output is added; spelt as a list of the other three, the rule would silently stop
 * counting the fourth. `skill` and `focus` are lists on an element, and match when any of
 * their members does.
 */
type Target<A extends RecipeAxis> = {
  axis: A;
  values: readonly AxisValues[A][];
  negate?: boolean;
};

/** A floor in elements, or a ceiling as a share of the lesson's elements — never both. */
type Bound = { min: number; maxShare?: never } | { maxShare: number; min?: never };

export type RecipeRule = { [A in RecipeAxis]: Target<A> & Bound }[RecipeAxis];

export interface Recipe {
  rules: readonly RecipeRule[];
}

export const EMPTY_RECIPE: Recipe = { rules: [] };

/**
 * One countable piece of a lesson.
 *
 * Channel and modality belong to the exercise and every element inherits them: a set of
 * questions is answered in one way throughout. The subject is the one axis an element can
 * carry on its own, because the catalogue records it per element.
 */
export interface RecipeElement {
  exerciseIndex: number;
  input: Input;
  output: Output;
  modality: Modality;
  skills: readonly Skill[];
  focus: readonly Focus[];
}

/**
 * The elements of one exercise.
 *
 * Built from the atoms with an `itemKey`, one element per key. An atom with no key names
 * the whole exercise, so its subject is added to every element rather than standing as
 * an element of its own — "this exercise is about grammar" says nothing about how many
 * things the learner answers. With no keyed atoms the exercise is a single element.
 *
 * The subject comes from the atoms only when the derived profile took it from them: an
 * author's override, or the template's hint, is a statement about the whole exercise and
 * outranks the graph here exactly as it does in `deriveSkills`.
 */
export function elementsOf(
  input: DeriveInput,
  exerciseIndex = 0,
  profile: DerivedProfile = deriveSkills(input),
): RecipeElement[] {
  const base = {
    exerciseIndex,
    input: profile.input,
    output: profile.output,
    modality: profile.modality,
    skills: profile.skills,
  };

  const keyed = keyedFoci(input.atoms);
  if (keyed.size === 0) return [{ ...base, focus: profile.focus }];
  if (profile.focusSource !== 'atoms') return [...keyed.keys()].map(() => ({ ...base, focus: profile.focus }));

  const whole = (input.atoms ?? [])
    .filter((atom) => !atom.itemKey)
    .map(atomFocus)
    .filter((focus): focus is Focus => focus !== null);
  // A structural hint is true of every element, as in `deriveSkills` (plan 68).
  whole.push(...structuralFocus(input.templateCode, input.content));

  return [...keyed.values()].map((foci) => ({ ...base, focus: orderFocuses([...foci, ...whole]) }));
}

function keyedFoci(atoms: readonly AtomRef[] | undefined): Map<string, Set<Focus>> {
  const byItem = new Map<string, Set<Focus>>();
  for (const atom of atoms ?? []) {
    if (!atom.itemKey) continue;
    const bucket = byItem.get(atom.itemKey) ?? new Set<Focus>();
    const focus = atomFocus(atom);
    if (focus) bucket.add(focus);
    byItem.set(atom.itemKey, bucket);
  }
  return byItem;
}

function valuesOn(element: RecipeElement, axis: RecipeAxis): readonly string[] {
  switch (axis) {
    case 'input':
      return [element.input];
    case 'output':
      return [element.output];
    case 'modality':
      return [element.modality];
    case 'skill':
      return element.skills;
    case 'focus':
      return element.focus;
  }
}

export function matches(element: RecipeElement, rule: RecipeRule): boolean {
  const wanted = rule.values as readonly string[];
  const hit = valuesOn(element, rule.axis).some((value) => wanted.includes(value));
  return rule.negate ? !hit : hit;
}

export type RecipeIssue =
  /** Fewer matching elements than the rule asks for. `0` is the case decision L is about. */
  | {
      code: 'RECIPE_BELOW_MIN';
      level: 'warning';
      ruleIndex: number;
      rule: RecipeRule;
      count: number;
      min: number;
      total: number;
    }
  /** More of the lesson than the rule allows. The share is left to the caller to format. */
  | {
      code: 'RECIPE_ABOVE_SHARE';
      level: 'warning';
      ruleIndex: number;
      rule: RecipeRule;
      count: number;
      maxShare: number;
      total: number;
    };

/**
 * Hold a lesson's elements against a recipe.
 *
 * A lesson with no elements gets no remarks: it is unwritten rather than unbalanced, and
 * the tree already says it is empty. The issue carries the rule and its index, so that
 * the interface can name the types that would close it and point at the line of the
 * recipe editor that asked for it.
 */
export function checkElements(elements: readonly RecipeElement[], recipe: Recipe): RecipeIssue[] {
  const total = elements.length;
  if (total === 0) return [];

  const issues: RecipeIssue[] = [];
  recipe.rules.forEach((rule, ruleIndex) => {
    const count = elements.filter((element) => matches(element, rule)).length;
    if (rule.min !== undefined && count < rule.min)
      issues.push({ code: 'RECIPE_BELOW_MIN', level: 'warning', ruleIndex, rule, count, min: rule.min, total });
    if (rule.maxShare !== undefined && count / total > rule.maxShare)
      issues.push({
        code: 'RECIPE_ABOVE_SHARE',
        level: 'warning',
        ruleIndex,
        rule,
        count,
        maxShare: rule.maxShare,
        total,
      });
  });
  return issues;
}

/** The exercises of one lesson, in lesson order, against a recipe. */
export function checkRecipe(lessonItems: readonly DeriveInput[], recipe: Recipe): RecipeIssue[] {
  return checkElements(
    lessonItems.flatMap((item, index) => elementsOf(item, index)),
    recipe,
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isAxis(value: unknown): value is RecipeAxis {
  return typeof value === 'string' && (RECIPE_AXES as readonly string[]).includes(value);
}

/**
 * One rule from an untrusted source — a JSON column, a request body — or null.
 *
 * Strict where leniency would change the meaning: an unknown value in `values` drops the
 * rule rather than the value, because "output is not `none` or `sung`" with the typo
 * removed is a different rule from the one the author wrote. A floor below one and a
 * ceiling of a whole lesson say nothing, and are refused rather than kept as dead lines.
 */
export function parseRule(value: unknown): RecipeRule | null {
  const raw = record(value);
  if (!raw || !isAxis(raw['axis'])) return null;
  const axis = raw['axis'];

  const values = raw['values'];
  const known = VOCABULARY[axis] as readonly string[];
  if (!Array.isArray(values) || values.length === 0) return null;
  if (!values.every((v) => typeof v === 'string' && known.includes(v))) return null;

  const negate = raw['negate'];
  if (negate !== undefined && typeof negate !== 'boolean') return null;

  const min = raw['min'];
  const maxShare = raw['maxShare'];
  const hasMin = min !== undefined && min !== null;
  const hasShare = maxShare !== undefined && maxShare !== null;
  if (hasMin === hasShare) return null;

  let bound: Bound;
  if (hasMin) {
    if (typeof min !== 'number' || !Number.isInteger(min) || min < 1) return null;
    bound = { min };
  } else {
    if (typeof maxShare !== 'number' || !(maxShare >= 0 && maxShare < 1)) return null;
    bound = { maxShare };
  }

  const unique = [...new Set(values as string[])];
  return { axis, values: unique, ...(negate ? { negate: true } : {}), ...bound } as RecipeRule;
}

/**
 * More rules than any method needs. A cap so that a stored recipe — checked against every
 * lesson of a course on every coverage read — stays a list a person wrote.
 */
export const MAX_RECIPE_RULES = 20;

/**
 * A recipe someone is about to store, or null if any part of it does not parse.
 *
 * The strict twin of `parseRecipe`: on the way in, a rule that would be dropped is the
 * author's mistake and must be refused, not saved as a shorter recipe than they wrote.
 */
export function readRecipe(value: unknown): Recipe | null {
  const rules = record(value)?.['rules'];
  if (!Array.isArray(rules) || rules.length > MAX_RECIPE_RULES) return null;
  const parsed = rules.map(parseRule);
  return parsed.every((rule): rule is RecipeRule => rule !== null) ? { rules: parsed } : null;
}

/**
 * A recipe from storage. Rules that do not parse are dropped; see `parseRule`.
 *
 * Lenient on the way out because what is stored was valid when it was written: a value
 * retired from an axis later should cost the rule that named it, not the whole recipe.
 */
export function parseRecipe(value: unknown): Recipe {
  const rules = record(value)?.['rules'];
  if (!Array.isArray(rules)) return EMPTY_RECIPE;
  return { rules: rules.map(parseRule).filter((rule): rule is RecipeRule => rule !== null) };
}

/**
 * Starting points, not standards (decision O): a workspace picks one and edits it.
 *
 * Each rule says why it holds what it holds, as the rows of `by-template.ts` do. Two
 * judgements run through all three:
 *
 * - **Speech is never asked for.** Nothing on the platform records it, so a rule about
 *   `spoken` would fail on every lesson of every course — the reason `issues.ts` does not
 *   nag about it either. The rule belongs here the day a speaking type ships.
 * - **The ceiling is on recognition, not the floor on production.** Production is asked
 *   for as "at least one"; the balance is held by refusing to let picking from a list
 *   become the whole lesson, which is the failure plan 63 §2 E was written against.
 */
export const RECIPE_PRESETS = {
  // A beginner lesson: something heard, something written by the learner, and no more
  // than three fifths picked off a list. Deliberately loose — at A1–A2 recognition is
  // honest work, and the point is only that it does not stand alone.
  balanced_a1_a2: {
    rules: [
      // The learner makes something: types a word, a sentence, a translation.
      { axis: 'output', values: ['none'], negate: true, min: 1 },
      // Something reaches them by ear. Video counts — the soundtrack is the point.
      { axis: 'input', values: ['audio', 'video'], min: 1 },
      { axis: 'modality', values: ['recognition'], maxShare: 0.6 },
    ],
  },

  // Preparation for a B1 exam (Norskprøven and its kind): the written parts are reading,
  // listening and writing a text of one's own, so each of them appears in every lesson,
  // and recognition is held to half.
  exam_b1: {
    rules: [
      { axis: 'input', values: ['text'], min: 2 },
      { axis: 'input', values: ['audio', 'video'], min: 2 },
      // A text of the learner's own, not a gap typed from memory: `recall` is not enough.
      { axis: 'modality', values: ['production'], min: 1 },
      { axis: 'modality', values: ['recognition'], maxShare: 0.5 },
    ],
  },

  // A lesson built around one rule: most of it is grammar, and the rule is retrieved
  // rather than recognised — knowing which ending looks right is not knowing the ending.
  grammar_intensive: {
    rules: [
      { axis: 'focus', values: ['grammar'], min: 4 },
      { axis: 'modality', values: ['recall', 'production'], min: 3 },
      { axis: 'output', values: ['written_target'], min: 1 },
      { axis: 'modality', values: ['recognition'], maxShare: 0.4 },
    ],
  },
} as const satisfies Record<string, Recipe>;

export type RecipePresetId = keyof typeof RECIPE_PRESETS;

export const RECIPE_PRESET_IDS = Object.keys(RECIPE_PRESETS) as RecipePresetId[];
