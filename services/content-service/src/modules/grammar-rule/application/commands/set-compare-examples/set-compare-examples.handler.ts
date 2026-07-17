import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { SetCompareExamplesCommand } from './set-compare-examples.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GrammarRuleCompareExampleEntity } from '../../../domain/entities/grammar-rule-compare-example.entity.js';
import { GRAMMAR_RULE_REPOSITORY } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleRepository } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import { GRAMMAR_RULE_EXPLANATION_REPOSITORY } from '../../../domain/repositories/grammar-rule-explanation.repository.interface.js';
import type { IGrammarRuleExplanationRepository } from '../../../domain/repositories/grammar-rule-explanation.repository.interface.js';
import { GRAMMAR_RULE_COMPARE_EXAMPLE_REPOSITORY } from '../../../domain/repositories/grammar-rule-compare-example.repository.interface.js';
import type { IGrammarRuleCompareExampleRepository } from '../../../domain/repositories/grammar-rule-compare-example.repository.interface.js';

@CommandHandler(SetCompareExamplesCommand)
export class SetCompareExamplesHandler implements ICommandHandler<
  SetCompareExamplesCommand,
  Result<void, GrammarRuleDomainError>
> {
  constructor(
    @Inject(GRAMMAR_RULE_REPOSITORY)
    private readonly ruleRepo: IGrammarRuleRepository,
    @Inject(GRAMMAR_RULE_EXPLANATION_REPOSITORY)
    private readonly explanationRepo: IGrammarRuleExplanationRepository,
    @Inject(GRAMMAR_RULE_COMPARE_EXAMPLE_REPOSITORY)
    private readonly compareExampleRepo: IGrammarRuleCompareExampleRepository,
  ) {}

  async execute(command: SetCompareExamplesCommand): Promise<Result<void, GrammarRuleDomainError>> {
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

    const positions = new Set<number>();
    const examples: GrammarRuleCompareExampleEntity[] = [];
    for (const input of command.items) {
      if (positions.has(input.position)) {
        return Result.fail(GrammarRuleDomainError.DUPLICATE_COMPARE_EXAMPLE_POSITION);
      }
      positions.add(input.position);

      const exampleResult = GrammarRuleCompareExampleEntity.create({
        explanationId: command.explanationId,
        position: input.position,
        sentence: input.sentence,
        note: input.note,
        isCorrect: input.isCorrect,
      });
      if (exampleResult.isFail) {
        return Result.fail(exampleResult.error);
      }
      examples.push(exampleResult.value);
    }

    await this.compareExampleRepo.replaceForExplanation(command.explanationId, examples);

    return Result.ok();
  }
}
