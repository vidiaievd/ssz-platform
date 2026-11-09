/** Which table an atom id points into — plan 63 §2 D; `sound` since plan 86, step 8.2. */
export enum AtomType {
  VOCABULARY_ITEM = 'vocabulary_item',
  GRAMMAR_RULE_ATOM = 'grammar_rule_atom',
  SOUND = 'sound',
}

/**
 * What a piece of work proves about the atom it names.
 *
 * `FOCUS` is what the item tests. `CONTEXT` is what the learner had to know to get there and
 * was not examined on — the word inside a gap that is testing an ending. One item can name
 * both, which is how a mixed exercise stays honest instead of being forced to call itself
 * lexical or grammatical.
 */
export enum TargetRole {
  FOCUS = 'focus',
  CONTEXT = 'context',
}

export const ATOM_TYPES: readonly AtomType[] = [
  AtomType.VOCABULARY_ITEM,
  AtomType.GRAMMAR_RULE_ATOM,
  AtomType.SOUND,
];

/**
 * `<language>:<family>` — the id of a `sound` atom (`nb:kj`), as ai-service names it. Words
 * and grammar atoms are uuids (of any version: seeded content is uuidv5).
 */
export const SOUND_ATOM_ID = /^[a-z]{2,3}:[a-z_]{1,32}$/;

export const TARGET_ROLES: readonly TargetRole[] = [TargetRole.FOCUS, TargetRole.CONTEXT];
