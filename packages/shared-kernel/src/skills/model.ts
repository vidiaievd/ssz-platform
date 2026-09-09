// The axes an exercise is measured on — plan 55 §3.1–3.3.
//
// Three axes, deliberately separate, because collapsing them is the mistake this module
// exists to prevent:
//
//   skill — the channel: listening / reading / spoken / written
//   focus — the subject: vocabulary / grammar / orthography / pragmatics
//   form  — how the answer was produced (bank / free), which already lives in
//           `AnswerForm` and `evidence-strength.ts` and is only *counted* here
//
// The tempting single list — "reading, grammar, listening, speaking" — mixes two of
// them. **Grammar is not a skill.** It is a competence that operates inside all four
// channels, and a learner can know a rule perfectly and still not hear it in running
// speech. One scale glues those two facts together and the diagnosis stops being
// actionable.
//
// `skill` is not a new vocabulary: it is `CanDoSkill` from content-service, the same
// four CEFR channels the can-do descriptor library is written against
// (`prisma/seed-can-do.ts`, 17 global descriptors A1–B2). A second, parallel list would
// mean the coverage report and can-do progress could never be compared.

/** The four CEFR channels. Order is canonical — reports and tests depend on it. */
export const SKILLS = ['listening', 'reading', 'spoken', 'written'] as const;
export type Skill = (typeof SKILLS)[number];

/** The subject being trained. Canonical order, as above. */
export const FOCUSES = ['vocabulary', 'grammar', 'orthography', 'pragmatics'] as const;
export type Focus = (typeof FOCUSES)[number];

/**
 * How the answer is produced, counted over content rather than over attempts.
 *
 * `mixed` is not "we could not tell": it is a template whose document decides, and
 * whose two documents genuinely differ — `word_bank_gap_fill` absorbed `fill_in_blank`,
 * so one template code covers both choosing from five words and typing from memory.
 * `unknown` is the honest gap: no rule and no document to read.
 */
export const FORMS = ['bank', 'free', 'mixed', 'unknown'] as const;
export type Form = (typeof FORMS)[number];

/**
 * Which rung of the priority chain produced a value (plan 55 §3.4).
 *
 * Returned to the caller, not kept for tidiness: the coverage strip has to be able to
 * tell an author where a value came from, or overriding it is guesswork. "Derived from
 * the template" and "you set this yourself" are different invitations.
 */
export const SKILL_SOURCES = ['override', 'placement', 'document', 'template', 'unknown'] as const;
export type SkillSource = (typeof SKILL_SOURCES)[number];

/** The focus chain is shorter than the skill chain — see `derive.ts`. */
export const FOCUS_SOURCES = ['override', 'atoms', 'template', 'unknown'] as const;
export type FocusSource = (typeof FOCUS_SOURCES)[number];

export function isSkill(value: unknown): value is Skill {
  return typeof value === 'string' && (SKILLS as readonly string[]).includes(value);
}

export function isFocus(value: unknown): value is Focus {
  return typeof value === 'string' && (FOCUSES as readonly string[]).includes(value);
}

/**
 * Deduplicate and put into canonical order.
 *
 * Every list this module returns goes through one of these, so `['written','reading']`
 * and `['reading','written']` can never be two different answers to one question — the
 * coverage report groups on these lists and a caller comparing them for equality is a
 * matter of time.
 */
export function orderSkills(values: Iterable<Skill>): Skill[] {
  const seen = new Set(values);
  return SKILLS.filter((s) => seen.has(s));
}

export function orderFocuses(values: Iterable<Focus>): Focus[] {
  const seen = new Set(values);
  return FOCUSES.filter((f) => seen.has(f));
}

/** Keep only the recognised members of an untrusted list (a column, a JSON payload). */
export function parseSkills(values: unknown): Skill[] {
  return Array.isArray(values) ? orderSkills(values.filter(isSkill)) : [];
}

export function parseFocuses(values: unknown): Focus[] {
  return Array.isArray(values) ? orderFocuses(values.filter(isFocus)) : [];
}
