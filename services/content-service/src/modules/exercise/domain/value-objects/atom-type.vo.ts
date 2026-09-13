/** Which table an atom id points into — plan 63 §2 D. */
export enum AtomType {
  VOCABULARY_ITEM = 'vocabulary_item',
  GRAMMAR_RULE_ATOM = 'grammar_rule_atom',
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
];

export const TARGET_ROLES: readonly TargetRole[] = [TargetRole.FOCUS, TargetRole.CONTEXT];
