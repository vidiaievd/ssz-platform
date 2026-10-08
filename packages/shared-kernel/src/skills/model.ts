// The axes an exercise is measured on — plan 55 §3.1–3.3.
//
// Three axes, deliberately separate, because collapsing them is the mistake this module
// exists to prevent:
//
//   skill — the channel: listening / reading / spoken / written, read off the pair
//           input × output since plan 64 (decision F) — see `channelsOf`
//   focus — the subject: vocabulary / grammar / orthography / pronunciation / phonology /
//           pragmatics
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

/**
 * What the learner has to take in to answer — plan 64, decision F.
 *
 * The channel used to be one list, and anything that changed how the exercise is
 * perceived replaced the whole list: a `short_answer` about a recording became
 * `listening` and stopped being written production, though the learner still wrote the
 * answer. Perception and production are two facts; they are now two fields, and the
 * CEFR channel is read off the pair by `channelsOf`.
 *
 * `text` means material in the target language that has to be *understood* to answer —
 * a passage, a stem, options to read. The frame of an item does not count: a sentence
 * with a gap in it is the shape of the answer, not something to comprehend, and a gap
 * fill is not a reading exercise. `none` is that case, and also a prompt written in the
 * language of explanation (rule 1 of `by-template.ts`, applied to the input side).
 * `image` is reserved: it names a channel CEFR does not measure, so it produces none.
 */
export const INPUTS = ['text', 'audio', 'video', 'image', 'none'] as const;
export type Input = (typeof INPUTS)[number];

/**
 * What the learner produces. `written_l1` is the answer written in the language of
 * explanation — real work, and not written production in the language being learnt
 * (rule 1 of `by-template.ts`). `spoken` is unreachable today: nothing records speech.
 */
export const OUTPUTS = ['none', 'written_target', 'written_l1', 'spoken'] as const;
export type Output = (typeof OUTPUTS)[number];

/**
 * The CEFR channels an exercise trains, from what goes in and what comes out.
 *
 * Pure and total, and the only place the mapping lives: the coverage report, can-do
 * descriptors and `SkillMastery` keep reading `Skill`, and none of them has to learn
 * the two new fields to stay correct.
 */
export function channelsOf(input: Input, output: Output): Skill[] {
  const channels: Skill[] = [];
  if (input === 'text') channels.push('reading');
  if (input === 'audio' || input === 'video') channels.push('listening');
  if (output === 'written_target') channels.push('written');
  if (output === 'spoken') channels.push('spoken');
  return orderSkills(channels);
}

export function isInput(value: unknown): value is Input {
  return typeof value === 'string' && (INPUTS as readonly string[]).includes(value);
}

export function isOutput(value: unknown): value is Output {
  return typeof value === 'string' && (OUTPUTS as readonly string[]).includes(value);
}

/**
 * The subject being trained. Canonical order, as above.
 *
 * `pronunciation` arrived with `read_aloud` (plan 70, Q5-A): the sound of a known word said
 * aloud, the speaking twin of `orthography`. `phonology` arrived with `minimal_pairs` (plan 72):
 * hearing a distinction the language makes — kj against sj, a long vowel against a short one.
 * Two values, not one: a learner can say «kjære» cleanly and still not hear it from «skjære»,
 * and the cure for each is different practice.
 */
export const FOCUSES = [
  'vocabulary',
  'grammar',
  'orthography',
  'pronunciation',
  'phonology',
  'pragmatics',
] as const;
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
 * How the learner knew it, as opposed to what they knew — plan 63 §2 E.
 *
 * A second axis, independent of skill and focus, and the one that tells two learners
 * apart where every other number says they are equal: 90 % on a bank of five words and
 * 30 % typing the same words from nothing is not "uneven knowledge of grammar", it is
 * knowledge that has reached recognition and no further. The cure is production, not more
 * of the same exercises, and nothing in the platform can see that today.
 *
 *   recognition — the answer is on screen among others; the learner picks it out
 *   recall      — the answer has to come from memory, with the shape of it given:
 *                 a gap to type into, a word to translate, an order to rebuild
 *   production  — the learner writes their own language beyond the item
 *
 * `unknown` is the honest gap, as everywhere else here: a template nobody has judged.
 */
export const MODALITIES = ['recognition', 'recall', 'production', 'unknown'] as const;
export type Modality = (typeof MODALITIES)[number];

export function isModality(value: unknown): value is Modality {
  return typeof value === 'string' && (MODALITIES as readonly string[]).includes(value);
}

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
