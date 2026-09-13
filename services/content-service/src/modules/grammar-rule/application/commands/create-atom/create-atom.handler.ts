import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CreateAtomCommand } from './create-atom.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GrammarRuleAtom } from '../../../domain/entities/grammar-rule-atom.entity.js';
import { GRAMMAR_RULE_REPOSITORY } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleRepository } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import { GRAMMAR_RULE_ATOM_REPOSITORY } from '../../../domain/repositories/grammar-rule-atom.repository.interface.js';
import type { IGrammarRuleAtomRepository } from '../../../domain/repositories/grammar-rule-atom.repository.interface.js';

export interface CreateAtomResult {
  atomId: string;
}

@CommandHandler(CreateAtomCommand)
export class CreateAtomHandler implements ICommandHandler<
  CreateAtomCommand,
  Result<CreateAtomResult, GrammarRuleDomainError>
> {
  constructor(
    @Inject(GRAMMAR_RULE_REPOSITORY)
    private readonly ruleRepo: IGrammarRuleRepository,
    @Inject(GRAMMAR_RULE_ATOM_REPOSITORY)
    private readonly atomRepo: IGrammarRuleAtomRepository,
  ) {}

  async execute(
    command: CreateAtomCommand,
  ): Promise<Result<CreateAtomResult, GrammarRuleDomainError>> {
    const rule = await this.ruleRepo.findById(command.ruleId);
    if (!rule || rule.deletedAt !== null) {
      return Result.fail(GrammarRuleDomainError.GRAMMAR_RULE_NOT_FOUND);
    }

    // The key is normalised by the entity, so the duplicate check has to run against the
    // same normalisation the entity would apply — otherwise `Definite-Plural` slips past a
    // check for `definite-plural` and the partial unique index rejects it at the database
    // instead, as a 500.
    const keyResult = GrammarRuleAtom.create({
      grammarRuleId: command.ruleId,
      key: command.key,
      title: command.title,
      description: command.description,
      track: command.track,
      position: 0,
      createdByUserId: command.userId,
    });
    if (keyResult.isFail) return Result.fail(keyResult.error);

    const existing = await this.atomRepo.findByKey(command.ruleId, keyResult.value.key);
    if (existing) {
      return Result.fail(GrammarRuleDomainError.ATOM_KEY_ALREADY_EXISTS);
    }

    const maxPosition = await this.atomRepo.getMaxPosition(command.ruleId);
    const positionResult = keyResult.value.updatePosition(maxPosition + 1);
    if (positionResult.isFail) return Result.fail(positionResult.error);

    const atom = await this.atomRepo.save(keyResult.value);
    return Result.ok({ atomId: atom.id });
  }
}
