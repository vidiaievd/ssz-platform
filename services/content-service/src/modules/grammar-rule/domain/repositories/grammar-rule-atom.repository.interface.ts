import { GrammarRuleAtom } from '../entities/grammar-rule-atom.entity.js';

export const GRAMMAR_RULE_ATOM_REPOSITORY = Symbol('GRAMMAR_RULE_ATOM_REPOSITORY');

export interface IGrammarRuleAtomRepository {
  /** Living atoms of a rule, ordered by position. */
  findByRuleId(ruleId: string): Promise<GrammarRuleAtom[]>;

  /** By id, retired ones included — callers decide what a retired atom means to them. */
  findById(atomId: string): Promise<GrammarRuleAtom | null>;

  /** The living atom holding this key inside the rule, if any. */
  findByKey(ruleId: string, key: string): Promise<GrammarRuleAtom | null>;

  save(atom: GrammarRuleAtom): Promise<GrammarRuleAtom>;

  /**
   * Retires every living atom of a rule, for when the rule itself is retired. Mirrors
   * `softDeleteByRuleId` on the explanation repository: a rule that is gone must not leave
   * its atoms standing in coverage reports.
   *
   * Returns how many were retired.
   */
  softDeleteByRuleId(ruleId: string): Promise<number>;

  /** Highest position among a rule's living atoms; -1 when it has none. */
  getMaxPosition(ruleId: string): Promise<number>;

  /**
   * Positions in one transaction, via the two-pass offset the exercise pool already uses:
   * every row is moved far out of the way first, then placed, so a swap never collides
   * with the partial unique index mid-transaction.
   */
  reorder(ruleId: string, items: Array<{ atomId: string; position: number }>): Promise<void>;
}
