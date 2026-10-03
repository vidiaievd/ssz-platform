// Rolling many exercises up into what a lesson, a module or a course actually trains —
// plan 55 §3.7.
//
// Three tallies, and **the third matters more than the first two**: a course can be
// impeccably balanced across the four skills and still consist, 84% of it, of picking an
// answer out of a list. `bySkill` and `byFocus` cannot see that; `byModality` can.
// (`byForm` came first and stays — it is the raw fact of whether a bank was on screen —
// but it puts `sentence_schema` and `multiple_choice` in one bucket, and the report reads
// `byModality` since plan 64, decision G.)
//
// Every bucket is always present, including the zeroes. That is the rule of §3.10 and it
// is the whole reason this returns records rather than the entries it happened to see:
// "this course has no listening" is the single most useful sentence the report can say,
// and it looks exactly like a missing key if the zeroes are dropped.

import type { DeriveInput, DerivedProfile } from './derive.js';
import { deriveSkills } from './derive.js';
import type { Focus, Form, Modality, Skill } from './model.js';
import { FOCUSES, FORMS, isModality, MODALITIES, SKILLS } from './model.js';

export type SkillTally = Record<Skill, number>;
export type FocusTally = Record<Focus | 'unknown', number>;
export type FormTally = Record<Form, number>;
export type ModalityTally = Record<Modality, number>;

/**
 * The table itself, not its two margins: how many exercises train this skill *and* this
 * subject.
 *
 * The margins cannot answer that. A course whose `bySkill.listening` is 12 and whose
 * `byFocus.grammar` is 40 may contain no listening-grammar exercise at all, and a reader
 * who multiplies the two margins is inventing a cell. Screen E of plan 58 asks exactly
 * this question — "covered but unreached" against "not taught at all" — and the
 * difference between those two sentences is a cell of this table being zero or not.
 *
 * An exercise carrying two skills and two subjects is counted in all four cells, for the
 * same reason the margins double-count: the question is "does anything here train this
 * pair", not "how do the exercises divide up".
 */
export type PairTally = Record<Skill, Record<Focus | 'unknown', number>>;

/**
 * The subject axis again, counted in elements instead of exercises.
 *
 * A set of eight questions, three about words and five about a rule, adds 0.375 to
 * vocabulary and 0.625 to grammar here, while `byFocus` above counts it once under each.
 * Both are true and they answer different questions — "does anything here teach grammar"
 * against "how much of this is grammar" — which is why the weighted reading is a second
 * tally rather than a correction of the first (plan 64, decision H).
 *
 * Exercises whose subject nobody recorded land in `unknown` at their full weight of one,
 * so the tally still sums to the number of exercises counted.
 */
export type WeightedFocusTally = Record<Focus | 'unknown', number>;

export interface Coverage {
  /** How many exercises were counted. Not the sum of any tally: an exercise can carry two skills. */
  total: number;
  bySkill: SkillTally;
  byFocus: FocusTally;
  /** The same axis in elements rather than exercises. See `WeightedFocusTally`. */
  byFocusWeighted: WeightedFocusTally;
  byForm: FormTally;
  /** How the answer had to be known — recognition, recall, production (plan 64, decision G). */
  byModality: ModalityTally;
  /** The skill × focus table behind the two margins above. Every cell present, zeroes included. */
  byPair: PairTally;
  /** Skills no exercise trains. Named explicitly so the caller need not diff against SKILLS. */
  emptySkills: Skill[];
  /** Exercises whose skill could not be derived at all — an unknown template code. */
  unclassified: number;
}

function emptySkillTally(): SkillTally {
  return { listening: 0, reading: 0, spoken: 0, written: 0 };
}

function emptyFocusTally(): FocusTally {
  return { vocabulary: 0, grammar: 0, orthography: 0, pragmatics: 0, unknown: 0 };
}

function emptyFormTally(): FormTally {
  return { bank: 0, free: 0, mixed: 0, unknown: 0 };
}

function emptyModalityTally(): ModalityTally {
  return { recognition: 0, recall: 0, production: 0, unknown: 0 };
}

function emptyPairTally(): PairTally {
  return {
    listening: emptyFocusTally(),
    reading: emptyFocusTally(),
    spoken: emptyFocusTally(),
    written: emptyFocusTally(),
  };
}

/**
 * Count a set of already-derived profiles.
 *
 * Separate from `coverage` so a caller that derived once — the attempt snapshot, say —
 * does not have to derive again to be counted.
 */
export function tally(profiles: readonly DerivedProfile[]): Coverage {
  const bySkill = emptySkillTally();
  const byFocus = emptyFocusTally();
  const byFocusWeighted = emptyFocusTally();
  const byForm = emptyFormTally();
  const byModality = emptyModalityTally();
  const byPair = emptyPairTally();
  let unclassified = 0;

  for (const profile of profiles) {
    if (profile.skills.length === 0) unclassified += 1;
    for (const skill of profile.skills) bySkill[skill] += 1;

    // An exercise with no focus is counted once under `unknown`, not zero times: the
    // bucket has to add up to the number of exercises or it cannot be read as a share.
    if (profile.focus.length === 0) byFocus.unknown += 1;
    else for (const focus of profile.focus) byFocus[focus] += 1;

    // Weighted where the element-level graph could say something, and evenly split over
    // the subjects the exercise names where it could not: a claim about the whole
    // exercise is one exercise's worth of evidence either way.
    // Read defensively: profiles also arrive from an event payload written by an older
    // build, and one missing field should cost the weighted reading of that exercise,
    // not the whole report.
    const weights = Object.entries(profile.focusWeights ?? {}) as [Focus, number][];
    if (weights.length > 0) {
      for (const [focus, weight] of weights) byFocusWeighted[focus] += weight;
    } else if (profile.focus.length === 0) {
      byFocusWeighted.unknown += 1;
    } else {
      for (const focus of profile.focus) byFocusWeighted[focus] += 1 / profile.focus.length;
    }

    byForm[profile.form] += 1;
    // Defensive for the same reason as the weights above: a profile from an event written
    // before plan 63 carries no modality, and that is `unknown`, not a crash.
    byModality[isModality(profile.modality) ? profile.modality : 'unknown'] += 1;

    // The cells of the table, on the same terms as the margins: an exercise with no
    // subject lands in the `unknown` column rather than in none, so that a row of the
    // table adds up to the exercises that train that skill.
    const foci = profile.focus.length === 0 ? (['unknown'] as const) : profile.focus;
    for (const skill of profile.skills) for (const focus of foci) byPair[skill][focus] += 1;
  }

  return {
    total: profiles.length,
    bySkill,
    byFocus,
    byFocusWeighted,
    byForm,
    byModality,
    byPair,
    emptySkills: SKILLS.filter((skill) => bySkill[skill] === 0),
    unclassified,
  };
}

export function coverage(exercises: readonly DeriveInput[]): Coverage {
  return tally(exercises.map(deriveSkills));
}

/** Share of the total, 0–1. Zero when nothing was counted — never NaN in a report. */
export function share(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

/** A cell of the report that differs between two versions of the same module (§3.7, Q5). */
export interface CoverageDifference {
  axis: 'skill' | 'focus' | 'form' | 'modality';
  key: string;
  draft: number;
  published: number;
}

/**
 * What changed between the draft and what the learner currently has.
 *
 * Computed here rather than in the web client on purpose: "did the versions diverge" is
 * one question, and leaving it to the UI means it gets answered again in the mobile app
 * and in every later consumer, by three slightly different rules.
 */
export function diff(draft: Coverage, published: Coverage): CoverageDifference[] {
  const out: CoverageDifference[] = [];

  for (const skill of SKILLS)
    if (draft.bySkill[skill] !== published.bySkill[skill])
      out.push({ axis: 'skill', key: skill, draft: draft.bySkill[skill], published: published.bySkill[skill] });

  for (const focus of [...FOCUSES, 'unknown'] as const)
    if (draft.byFocus[focus] !== published.byFocus[focus])
      out.push({ axis: 'focus', key: focus, draft: draft.byFocus[focus], published: published.byFocus[focus] });

  for (const form of FORMS)
    if (draft.byForm[form] !== published.byForm[form])
      out.push({ axis: 'form', key: form, draft: draft.byForm[form], published: published.byForm[form] });

  for (const modality of MODALITIES)
    if (draft.byModality[modality] !== published.byModality[modality])
      out.push({
        axis: 'modality',
        key: modality,
        draft: draft.byModality[modality],
        published: published.byModality[modality],
      });

  return out;
}

export function diverges(draft: Coverage, published: Coverage): boolean {
  return diff(draft, published).length > 0;
}
