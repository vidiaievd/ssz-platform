import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { DeleteGrammarRuleCommand } from './delete-grammar-rule.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GRAMMAR_RULE_REPOSITORY } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleRepository } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import { GRAMMAR_RULE_EXPLANATION_REPOSITORY } from '../../../domain/repositories/grammar-rule-explanation.repository.interface.js';
import type { IGrammarRuleExplanationRepository } from '../../../domain/repositories/grammar-rule-explanation.repository.interface.js';
import { GRAMMAR_RULE_ATOM_REPOSITORY } from '../../../domain/repositories/grammar-rule-atom.repository.interface.js';
import type { IGrammarRuleAtomRepository } from '../../../domain/repositories/grammar-rule-atom.repository.interface.js';

@CommandHandler(DeleteGrammarRuleCommand)
export class DeleteGrammarRuleHandler implements ICommandHandler<
  DeleteGrammarRuleCommand,
  Result<void, GrammarRuleDomainError>
> {
  constructor(
    @Inject(GRAMMAR_RULE_REPOSITORY)
    private readonly ruleRepo: IGrammarRuleRepository,
    @Inject(GRAMMAR_RULE_EXPLANATION_REPOSITORY)
    private readonly explanationRepo: IGrammarRuleExplanationRepository,
    @Inject(GRAMMAR_RULE_ATOM_REPOSITORY)
    private readonly atomRepo: IGrammarRuleAtomRepository,
  ) {}

  async execute(command: DeleteGrammarRuleCommand): Promise<Result<void, GrammarRuleDomainError>> {
    const rule = await this.ruleRepo.findById(command.ruleId);
    if (!rule) {
      return Result.fail(GrammarRuleDomainError.GRAMMAR_RULE_NOT_FOUND);
    }
    const hasRefs = await this.ruleRepo.hasPublishedContainerReferences(command.ruleId);
    if (hasRefs) {
      return Result.fail(GrammarRuleDomainError.RULE_HAS_PUBLISHED_CONTAINER_REFERENCES);
    }

    const deleteResult = rule.softDelete();
    if (deleteResult.isFail) {
      return Result.fail(deleteResult.error);
    }

    await this.ruleRepo.save(rule);
    await this.explanationRepo.softDeleteByRuleId(command.ruleId);
    // Atoms follow the rule down, the same way explanations do. Left standing, they would
    // keep appearing in coverage reports as facts a course is expected to teach, belonging
    // to a rule nobody can open. Retiring is enough: a practised atom still owns cards and
    // exercise targets, and those must keep resolving.
    await this.atomRepo.softDeleteByRuleId(command.ruleId);

    return Result.ok();
  }
}
