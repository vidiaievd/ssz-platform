// Rolling many exercises up into what a lesson, a module or a course actually trains —
// plan 55 §3.7.
//
// Three tallies, and **the third matters more than the first two**: a course can be
// impeccably balanced across the four skills and still consist, 84% of it, of picking an
// answer out of a list. `bySkill` and `byFocus` cannot see that; `byForm` can.
//
// Every bucket is always present, including the zeroes. That is the rule of §3.10 and it
// is the whole reason this returns records rather than the entries it happened to see:
// "this course has no listening" is the single most useful sentence the report can say,
// and it looks exactly like a missing key if the zeroes are dropped.

import type { DeriveInput, DerivedProfile } from './derive.js';
import { deriveSkills } from './derive.js';
import type { Focus, Form, Skill } from './model.js';
import { FOCUSES, FORMS, SKILLS } from './model.js';

export type SkillTally = Record<Skill, number>;
export type FocusTally = Record<Focus | 'unknown', number>;
export type FormTally = Record<Form, number>;

export interface Coverage {
  /** How many exercises were counted. Not the sum of any tally: an exercise can carry two skills. */
  total: number;
  bySkill: SkillTally;
  byFocus: FocusTally;
  byForm: FormTally;
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

/**
 * Count a set of already-derived profiles.
 *
 * Separate from `coverage` so a caller that derived once — the attempt snapshot, say —
 * does not have to derive again to be counted.
 */
export function tally(profiles: readonly DerivedProfile[]): Coverage {
  const bySkill = emptySkillTally();
  const byFocus = emptyFocusTally();
  const byForm = emptyFormTally();
  let unclassified = 0;

  for (const profile of profiles) {
    if (profile.skills.length === 0) unclassified += 1;
    for (const skill of profile.skills) bySkill[skill] += 1;

    // An exercise with no focus is counted once under `unknown`, not zero times: the
    // bucket has to add up to the number of exercises or it cannot be read as a share.
    if (profile.focus.length === 0) byFocus.unknown += 1;
    else for (const focus of profile.focus) byFocus[focus] += 1;

    byForm[profile.form] += 1;
  }

  return {
    total: profiles.length,
    bySkill,
    byFocus,
    byForm,
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
  axis: 'skill' | 'focus' | 'form';
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

  return out;
}

export function diverges(draft: Coverage, published: Coverage): boolean {
  return diff(draft, published).length > 0;
}
