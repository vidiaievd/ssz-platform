import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ReorderAtomsCommand } from './reorder-atoms.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GRAMMAR_RULE_ATOM_REPOSITORY } from '../../../domain/repositories/grammar-rule-atom.repository.interface.js';
import type { IGrammarRuleAtomRepository } from '../../../domain/repositories/grammar-rule-atom.repository.interface.js';

@CommandHandler(ReorderAtomsCommand)
export class ReorderAtomsHandler implements ICommandHandler<
  ReorderAtomsCommand,
  Result<void, GrammarRuleDomainError>
> {
  constructor(
    @Inject(GRAMMAR_RULE_ATOM_REPOSITORY)
    private readonly atomRepo: IGrammarRuleAtomRepository,
  ) {}

  async execute(command: ReorderAtomsCommand): Promise<Result<void, GrammarRuleDomainError>> {
    if (command.items.length === 0) {
      return Result.fail(GrammarRuleDomainError.INVALID_REORDER_INPUT);
    }

    const living = await this.atomRepo.findByRuleId(command.ruleId);
    const livingIds = new Set(living.map((atom) => atom.id));

    // The whole set must be sent, not a subset: a partial reorder leaves the untouched
    // atoms holding positions the new ones are about to claim, and the unique index would
    // reject the second pass. Rejecting it here makes that a 422 with a name rather than a
    // constraint violation with a stack trace.
    if (command.items.length !== living.length) {
      return Result.fail(GrammarRuleDomainError.INVALID_REORDER_INPUT);
    }

    const seenIds = new Set<string>();
    const seenPositions = new Set<number>();
    for (const item of command.items) {
      if (!livingIds.has(item.atomId) || seenIds.has(item.atomId)) {
        return Result.fail(GrammarRuleDomainError.INVALID_REORDER_INPUT);
      }
      if (item.position < 0 || seenPositions.has(item.position)) {
        return Result.fail(GrammarRuleDomainError.INVALID_REORDER_INPUT);
      }
      seenIds.add(item.atomId);
      seenPositions.add(item.position);
    }

    await this.atomRepo.reorder(command.ruleId, command.items);
    return Result.ok();
  }
}
