import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { MoveAtomCommand } from './move-atom.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GRAMMAR_RULE_REPOSITORY } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleRepository } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import { GRAMMAR_RULE_ATOM_REPOSITORY } from '../../../domain/repositories/grammar-rule-atom.repository.interface.js';
import type { IGrammarRuleAtomRepository } from '../../../domain/repositories/grammar-rule-atom.repository.interface.js';
import { EntityResolverRegistry } from '../../../../../shared/access-control/infrastructure/registry/entity-resolver-registry.js';
import { VisibilityCheckerService } from '../../../../../shared/access-control/domain/services/visibility-checker.service.js';
import { TaggableEntityType } from '../../../../../shared/access-control/domain/types/taggable-entity-type.js';

/**
 * Re-parents an atom under another rule — plan 63 §2 B, the operation every restructure is
 * built from. Splitting a rule is creating one and moving atoms across; merging two is
 * moving all of them one way and retiring the rule left empty.
 *
 * Nothing a learner owns moves with it, because nothing a learner owns points at the rule:
 * cards and exercise targets address the atom by id.
 */
@CommandHandler(MoveAtomCommand)
export class MoveAtomHandler implements ICommandHandler<
  MoveAtomCommand,
  Result<void, GrammarRuleDomainError>
> {
  constructor(
    @Inject(GRAMMAR_RULE_REPOSITORY)
    private readonly ruleRepo: IGrammarRuleRepository,
    @Inject(GRAMMAR_RULE_ATOM_REPOSITORY)
    private readonly atomRepo: IGrammarRuleAtomRepository,
    private readonly registry: EntityResolverRegistry,
    private readonly checker: VisibilityCheckerService,
  ) {}

  async execute(command: MoveAtomCommand): Promise<Result<void, GrammarRuleDomainError>> {
    if (command.targetRuleId === command.ruleId) {
      return Result.fail(GrammarRuleDomainError.INVALID_ATOM_DATA);
    }

    const atom = await this.atomRepo.findById(command.atomId);
    if (!atom || atom.grammarRuleId !== command.ruleId || atom.deletedAt !== null) {
      return Result.fail(GrammarRuleDomainError.ATOM_NOT_FOUND);
    }

    const targetRule = await this.ruleRepo.findById(command.targetRuleId);
    if (!targetRule || targetRule.deletedAt !== null) {
      return Result.fail(GrammarRuleDomainError.GRAMMAR_RULE_NOT_FOUND);
    }

    // The route guard only knows the rule in the path, and a move writes into a second one.
    // Without this, edit rights on any rule would let a caller push atoms into every rule in
    // the service.
    const targetEntity = await this.registry.resolve(
      TaggableEntityType.GRAMMAR_RULE,
      command.targetRuleId,
    );
    if (!targetEntity) {
      return Result.fail(GrammarRuleDomainError.GRAMMAR_RULE_NOT_FOUND);
    }
    const decision = await this.checker.canAccess(
      { userId: command.userId, isPlatformAdmin: command.isPlatformAdmin, roles: [] },
      targetEntity,
      'edit',
    );
    if (!decision.allowed) {
      return Result.fail(GrammarRuleDomainError.INSUFFICIENT_PERMISSIONS);
    }

    // A merge routinely brings two atoms named `gender` into one rule. The caller has to say
    // what the survivor is called, rather than the move failing halfway or silently renaming.
    const keyInTarget = command.key ?? atom.key;
    const clash = await this.atomRepo.findByKey(command.targetRuleId, keyInTarget.toLowerCase());
    if (clash) {
      return Result.fail(GrammarRuleDomainError.ATOM_KEY_ALREADY_EXISTS);
    }

    const maxPosition = await this.atomRepo.getMaxPosition(command.targetRuleId);
    const moveResult = atom.moveTo(command.targetRuleId, maxPosition + 1, command.key);
    if (moveResult.isFail) return Result.fail(moveResult.error);

    await this.atomRepo.save(atom);
    return Result.ok();
  }
}
