import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetAtomsQuery } from './get-atoms.query.js';
import { GrammarRuleAtom } from '../../../domain/entities/grammar-rule-atom.entity.js';
import { GRAMMAR_RULE_ATOM_REPOSITORY } from '../../../domain/repositories/grammar-rule-atom.repository.interface.js';
import type { IGrammarRuleAtomRepository } from '../../../domain/repositories/grammar-rule-atom.repository.interface.js';

/**
 * Living atoms of a rule, ordered. Not paginated: an atom list that needs paging is a rule
 * that has been cut too fine, and the editor should show that as a whole.
 */
@QueryHandler(GetAtomsQuery)
export class GetAtomsHandler implements IQueryHandler<GetAtomsQuery, GrammarRuleAtom[]> {
  constructor(
    @Inject(GRAMMAR_RULE_ATOM_REPOSITORY)
    private readonly atomRepo: IGrammarRuleAtomRepository,
  ) {}

  async execute(query: GetAtomsQuery): Promise<GrammarRuleAtom[]> {
    return this.atomRepo.findByRuleId(query.ruleId);
  }
}
