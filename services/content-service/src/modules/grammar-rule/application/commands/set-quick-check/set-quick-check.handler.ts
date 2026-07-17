import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { SetQuickCheckCommand } from './set-quick-check.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GrammarRuleQuickCheckEntity } from '../../../domain/entities/grammar-rule-quick-check.entity.js';
import { GRAMMAR_RULE_REPOSITORY } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleRepository } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import { GRAMMAR_RULE_EXPLANATION_REPOSITORY } from '../../../domain/repositories/grammar-rule-explanation.repository.interface.js';
import type { IGrammarRuleExplanationRepository } from '../../../domain/repositories/grammar-rule-explanation.repository.interface.js';
import { GRAMMAR_RULE_QUICK_CHECK_REPOSITORY } from '../../../domain/repositories/grammar-rule-quick-check.repository.interface.js';
import type { IGrammarRuleQuickCheckRepository } from '../../../domain/repositories/grammar-rule-quick-check.repository.interface.js';

@CommandHandler(SetQuickCheckCommand)
export class SetQuickCheckHandler implements ICommandHandler<
  SetQuickCheckCommand,
  Result<void, GrammarRuleDomainError>
> {
  constructor(
    @Inject(GRAMMAR_RULE_REPOSITORY)
    private readonly ruleRepo: IGrammarRuleRepository,
    @Inject(GRAMMAR_RULE_EXPLANATION_REPOSITORY)
    private readonly explanationRepo: IGrammarRuleExplanationRepository,
    @Inject(GRAMMAR_RULE_QUICK_CHECK_REPOSITORY)
    private readonly quickCheckRepo: IGrammarRuleQuickCheckRepository,
  ) {}

  async execute(command: SetQuickCheckCommand): Promise<Result<void, GrammarRuleDomainError>> {
    const explanation = await this.explanationRepo.findById(command.explanationId);
    if (!explanation || explanation.grammarRuleId !== command.ruleId) {
      return Result.fail(GrammarRuleDomainError.EXPLANATION_NOT_FOUND);
    }

    const rule = await this.ruleRepo.findById(command.ruleId);
    if (!rule || rule.deletedAt !== null) {
      return Result.fail(GrammarRuleDomainError.GRAMMAR_RULE_NOT_FOUND);
    }
    if (rule.ownerUserId !== command.userId) {
      return Result.fail(GrammarRuleDomainError.INSUFFICIENT_PERMISSIONS);
    }

    if (command.quickCheck === null) {
      await this.quickCheckRepo.upsertForExplanation(command.explanationId, null);
      return Result.ok();
    }

    const quickCheckResult = GrammarRuleQuickCheckEntity.create({
      explanationId: command.explanationId,
      question: command.quickCheck.question,
      options: command.quickCheck.options,
      correctOptionIndex: command.quickCheck.correctOptionIndex,
      explanation: command.quickCheck.explanation,
    });
    if (quickCheckResult.isFail) {
      return Result.fail(quickCheckResult.error);
    }

    await this.quickCheckRepo.upsertForExplanation(command.explanationId, quickCheckResult.value);

    return Result.ok();
  }
}
