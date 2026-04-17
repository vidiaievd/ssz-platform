import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateGrammarRuleCommand } from './update-grammar-rule.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import { GRAMMAR_RULE_REPOSITORY } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleRepository } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import { generateSlug, resolveUniqueSlug } from '../../../../../shared/utils/slug.util.js';

@CommandHandler(UpdateGrammarRuleCommand)
export class UpdateGrammarRuleHandler implements ICommandHandler<
  UpdateGrammarRuleCommand,
  Result<void, GrammarRuleDomainError>
> {
  constructor(
    @Inject(GRAMMAR_RULE_REPOSITORY)
    private readonly ruleRepo: IGrammarRuleRepository,
  ) {}

  async execute(command: UpdateGrammarRuleCommand): Promise<Result<void, GrammarRuleDomainError>> {
    const rule = await this.ruleRepo.findById(command.ruleId);
    if (!rule) {
      return Result.fail(GrammarRuleDomainError.GRAMMAR_RULE_NOT_FOUND);
    }
    if (rule.ownerUserId !== command.userId) {
      return Result.fail(GrammarRuleDomainError.INSUFFICIENT_PERMISSIONS);
    }

    const updateResult = rule.update({
      title: command.title,
      description: command.description,
      difficultyLevel: command.difficultyLevel,
      topic: command.topic,
      subtopic: command.subtopic,
      visibility: command.visibility,
    });

    if (updateResult.isFail) {
      return Result.fail(updateResult.error);
    }

    // Assign slug when transitioning to PUBLIC for the first time.
    if (command.visibility === Visibility.PUBLIC && rule.slug === null) {
      const base = generateSlug(rule.title);
      const slug = await resolveUniqueSlug(base, (c) => this.ruleRepo.isSlugTaken(c));
      const slugResult = rule.assignSlug(slug);
      if (slugResult.isFail) {
        return Result.fail(slugResult.error);
      }
    }

    await this.ruleRepo.save(rule);

    return Result.ok();
  }
}
