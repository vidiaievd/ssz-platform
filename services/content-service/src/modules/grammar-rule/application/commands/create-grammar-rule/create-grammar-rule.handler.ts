import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CreateGrammarRuleCommand } from './create-grammar-rule.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GrammarRuleEntity } from '../../../domain/entities/grammar-rule.entity.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import { GRAMMAR_RULE_REPOSITORY } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleRepository } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import { generateSlug, resolveUniqueSlug } from '../../../../../shared/utils/slug.util.js';

export interface CreateGrammarRuleResult {
  ruleId: string;
}

@CommandHandler(CreateGrammarRuleCommand)
export class CreateGrammarRuleHandler implements ICommandHandler<
  CreateGrammarRuleCommand,
  Result<CreateGrammarRuleResult, GrammarRuleDomainError>
> {
  constructor(
    @Inject(GRAMMAR_RULE_REPOSITORY)
    private readonly ruleRepo: IGrammarRuleRepository,
  ) {}

  async execute(
    command: CreateGrammarRuleCommand,
  ): Promise<Result<CreateGrammarRuleResult, GrammarRuleDomainError>> {
    const ruleResult = GrammarRuleEntity.create({
      targetLanguage: command.targetLanguage,
      difficultyLevel: command.difficultyLevel,
      topic: command.topic,
      subtopic: command.subtopic,
      title: command.title,
      description: command.description,
      ownerUserId: command.userId,
      ownerSchoolId: command.ownerSchoolId,
      visibility: command.visibility,
    });

    if (ruleResult.isFail) {
      return Result.fail(ruleResult.error);
    }

    const rule = ruleResult.value;

    if (command.visibility === Visibility.PUBLIC) {
      const baseSlug = generateSlug(command.title);
      const slug = await resolveUniqueSlug(baseSlug, (candidate) =>
        this.ruleRepo.isSlugTaken(candidate),
      );
      const slugResult = rule.assignSlug(slug);
      if (slugResult.isFail) {
        return Result.fail(slugResult.error);
      }
    }

    await this.ruleRepo.save(rule);

    return Result.ok({ ruleId: rule.id });
  }
}
