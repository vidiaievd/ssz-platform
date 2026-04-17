import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CreateExplanationCommand } from './create-explanation.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GrammarRuleExplanationEntity } from '../../../domain/entities/grammar-rule-explanation.entity.js';
import { GRAMMAR_RULE_REPOSITORY } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleRepository } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import { GRAMMAR_RULE_EXPLANATION_REPOSITORY } from '../../../domain/repositories/grammar-rule-explanation.repository.interface.js';
import type { IGrammarRuleExplanationRepository } from '../../../domain/repositories/grammar-rule-explanation.repository.interface.js';

export interface CreateExplanationResult {
  explanationId: string;
}

@CommandHandler(CreateExplanationCommand)
export class CreateExplanationHandler implements ICommandHandler<
  CreateExplanationCommand,
  Result<CreateExplanationResult, GrammarRuleDomainError>
> {
  constructor(
    @Inject(GRAMMAR_RULE_REPOSITORY)
    private readonly ruleRepo: IGrammarRuleRepository,
    @Inject(GRAMMAR_RULE_EXPLANATION_REPOSITORY)
    private readonly explanationRepo: IGrammarRuleExplanationRepository,
  ) {}

  async execute(
    command: CreateExplanationCommand,
  ): Promise<Result<CreateExplanationResult, GrammarRuleDomainError>> {
    const rule = await this.ruleRepo.findById(command.ruleId);
    if (!rule || rule.deletedAt !== null) {
      return Result.fail(GrammarRuleDomainError.GRAMMAR_RULE_NOT_FOUND);
    }
    if (rule.ownerUserId !== command.userId) {
      return Result.fail(GrammarRuleDomainError.INSUFFICIENT_PERMISSIONS);
    }

    const existing = await this.explanationRepo.findByCompositeKey(
      command.ruleId,
      command.explanationLanguage,
      command.minLevel,
      command.maxLevel,
    );
    if (existing) {
      return Result.fail(GrammarRuleDomainError.DUPLICATE_EXPLANATION);
    }

    const explanationResult = GrammarRuleExplanationEntity.create({
      grammarRuleId: command.ruleId,
      explanationLanguage: command.explanationLanguage,
      minLevel: command.minLevel,
      maxLevel: command.maxLevel,
      displayTitle: command.displayTitle,
      displaySummary: command.displaySummary,
      bodyMarkdown: command.bodyMarkdown,
      estimatedReadingMinutes: command.estimatedReadingMinutes,
      createdByUserId: command.userId,
    });

    if (explanationResult.isFail) {
      return Result.fail(explanationResult.error);
    }

    const explanation = explanationResult.value;
    await this.explanationRepo.save(explanation);

    return Result.ok({ explanationId: explanation.id });
  }
}
