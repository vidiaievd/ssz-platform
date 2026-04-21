import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PublishExplanationCommand } from './publish-explanation.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import { GRAMMAR_RULE_REPOSITORY } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleRepository } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import { GRAMMAR_RULE_EXPLANATION_REPOSITORY } from '../../../domain/repositories/grammar-rule-explanation.repository.interface.js';
import type { IGrammarRuleExplanationRepository } from '../../../domain/repositories/grammar-rule-explanation.repository.interface.js';
import { generateSlug, resolveUniqueSlug } from '../../../../../shared/utils/slug.util.js';

@CommandHandler(PublishExplanationCommand)
export class PublishExplanationHandler implements ICommandHandler<
  PublishExplanationCommand,
  Result<void, GrammarRuleDomainError>
> {
  constructor(
    @Inject(GRAMMAR_RULE_REPOSITORY)
    private readonly ruleRepo: IGrammarRuleRepository,
    @Inject(GRAMMAR_RULE_EXPLANATION_REPOSITORY)
    private readonly explanationRepo: IGrammarRuleExplanationRepository,
  ) {}

  async execute(command: PublishExplanationCommand): Promise<Result<void, GrammarRuleDomainError>> {
    const rule = await this.ruleRepo.findById(command.ruleId);
    if (!rule || rule.deletedAt !== null) {
      return Result.fail(GrammarRuleDomainError.GRAMMAR_RULE_NOT_FOUND);
    }
    if (rule.ownerUserId !== command.userId) {
      return Result.fail(GrammarRuleDomainError.INSUFFICIENT_PERMISSIONS);
    }

    const explanation = await this.explanationRepo.findById(command.explanationId);
    if (!explanation || explanation.grammarRuleId !== command.ruleId) {
      return Result.fail(GrammarRuleDomainError.EXPLANATION_NOT_FOUND);
    }

    const publishResult = explanation.publish();
    if (publishResult.isFail) {
      return Result.fail(publishResult.error);
    }

    await this.explanationRepo.save(explanation);

    // Auto-assign slug to rule when its first explanation is published and rule is PUBLIC.
    if (rule.visibility === Visibility.PUBLIC && rule.slug === null) {
      const base = generateSlug(rule.title);
      const slug = await resolveUniqueSlug(base, (c) => this.ruleRepo.isSlugTaken(c));
      rule.assignSlug(slug);
      await this.ruleRepo.save(rule);
    }

    return Result.ok();
  }
}
