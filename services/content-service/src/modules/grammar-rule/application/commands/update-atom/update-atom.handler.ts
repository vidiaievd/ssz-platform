import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateAtomCommand } from './update-atom.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GRAMMAR_RULE_ATOM_REPOSITORY } from '../../../domain/repositories/grammar-rule-atom.repository.interface.js';
import type { IGrammarRuleAtomRepository } from '../../../domain/repositories/grammar-rule-atom.repository.interface.js';

@CommandHandler(UpdateAtomCommand)
export class UpdateAtomHandler implements ICommandHandler<
  UpdateAtomCommand,
  Result<void, GrammarRuleDomainError>
> {
  constructor(
    @Inject(GRAMMAR_RULE_ATOM_REPOSITORY)
    private readonly atomRepo: IGrammarRuleAtomRepository,
  ) {}

  async execute(command: UpdateAtomCommand): Promise<Result<void, GrammarRuleDomainError>> {
    const atom = await this.atomRepo.findById(command.atomId);
    // The rule id is checked as well as the atom id: the route nests one inside the other,
    // and an atom addressed through a rule it does not belong to is not found, not editable.
    if (!atom || atom.grammarRuleId !== command.ruleId || atom.deletedAt !== null) {
      return Result.fail(GrammarRuleDomainError.ATOM_NOT_FOUND);
    }

    // Renaming is safe for a learner's memory — the id is the address — but the new slug
    // still has to be free among the rule's living atoms, or the partial unique index would
    // answer with a 500 instead of a named conflict.
    if (command.key !== undefined) {
      const normalised = command.key.trim().toLowerCase();
      if (normalised !== atom.key) {
        const clash = await this.atomRepo.findByKey(command.ruleId, normalised);
        if (clash) return Result.fail(GrammarRuleDomainError.ATOM_KEY_ALREADY_EXISTS);
      }
    }

    const updateResult = atom.update({
      key: command.key,
      title: command.title,
      description: command.description,
      track: command.track,
    });
    if (updateResult.isFail) return Result.fail(updateResult.error);

    await this.atomRepo.save(atom);
    return Result.ok();
  }
}
