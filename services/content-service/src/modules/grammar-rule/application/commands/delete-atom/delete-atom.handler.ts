import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { DeleteAtomCommand } from './delete-atom.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GRAMMAR_RULE_ATOM_REPOSITORY } from '../../../domain/repositories/grammar-rule-atom.repository.interface.js';
import type { IGrammarRuleAtomRepository } from '../../../domain/repositories/grammar-rule-atom.repository.interface.js';

/**
 * Retires an atom. Never a hard delete — see the entity for why.
 *
 * Positions of the remaining atoms are left alone: gaps are allowed, exactly as they are in
 * the exercise pool, and a reorder restores continuous numbering when the author next drags
 * something.
 */
@CommandHandler(DeleteAtomCommand)
export class DeleteAtomHandler implements ICommandHandler<
  DeleteAtomCommand,
  Result<void, GrammarRuleDomainError>
> {
  constructor(
    @Inject(GRAMMAR_RULE_ATOM_REPOSITORY)
    private readonly atomRepo: IGrammarRuleAtomRepository,
  ) {}

  async execute(command: DeleteAtomCommand): Promise<Result<void, GrammarRuleDomainError>> {
    const atom = await this.atomRepo.findById(command.atomId);
    if (!atom || atom.grammarRuleId !== command.ruleId) {
      return Result.fail(GrammarRuleDomainError.ATOM_NOT_FOUND);
    }

    const deleteResult = atom.softDelete();
    if (deleteResult.isFail) return Result.fail(deleteResult.error);

    await this.atomRepo.save(atom);
    return Result.ok();
  }
}
