import { CommandBus, CommandHandler, QueryBus, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { SRS_REPOSITORY, type ISrsRepository } from '../../domain/repositories/srs-repository.interface.js';
import {
  SrsAtomCoverageUnavailableError,
  SrsAtomNotReachedError,
  type SrsApplicationError,
} from '../errors/srs-application.errors.js';
import { toReviewCardDto, type ReviewCardDto } from '../dto/srs.dto.js';
import { Result } from '../../../../shared/kernel/result.js';
import { GetLearnerGrammarAtomsQuery } from '../queries/get-learner-grammar-atoms.query.js';
import type { LearnerGrammarAtomsResult } from '../queries/get-learner-grammar-atoms.handler.js';
import { AddReachedAtomCommand } from './add-reached-atom.command.js';
import { IntroduceCardCommand } from './introduce-card.command.js';

/**
 * "Worth repeating — add to review?" answered yes (plan 85, step 6).
 *
 * Only an atom the learner has reached may be added, by the same reading that built the
 * model's catalogue (`GetLearnerGrammarAtomsQuery`, Q1): a rule from later in the course
 * is the course's business, and a card for it would schedule what was never taught.
 *
 * Idempotent: a card already there — suspended included — comes back as it is. A
 * suspended card is the learner's own decision and is not reopened by this button; the
 * screen never offers it (step 1 leaves suspended atoms out).
 *
 * The card is written in shadow, like every `GRAMMAR_ATOM` card until plan 63 phase 7:
 * no client can draw one in the due queue yet. It is therefore not charged to the daily
 * new-card budget either. What the learner gets now is the card itself — the flags of
 * step 5 pull it in from the next mistake on — and the queue shows it once phase 7 lifts
 * the shadow from the type.
 */
@CommandHandler(AddReachedAtomCommand)
export class AddReachedAtomHandler
  implements ICommandHandler<AddReachedAtomCommand, Result<ReviewCardDto, SrsApplicationError>>
{
  constructor(
    @Inject(SRS_REPOSITORY) private readonly repo: ISrsRepository,
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(cmd: AddReachedAtomCommand): Promise<Result<ReviewCardDto, SrsApplicationError>> {
    const existing = await this.repo.findByUserAndContent(cmd.userId, 'GRAMMAR_ATOM', cmd.atomId);
    if (existing) return Result.ok(toReviewCardDto(existing));

    const reached: LearnerGrammarAtomsResult = await this.queryBus.execute(
      new GetLearnerGrammarAtomsQuery(cmd.userId, cmd.courseId),
    );
    if (!reached.atoms.some((atom) => atom.atomId === cmd.atomId)) {
      // With part of the course unanswered, "not reached" is a guess, not a fact.
      return Result.fail(
        reached.partial ? new SrsAtomCoverageUnavailableError() : new SrsAtomNotReachedError(cmd.atomId),
      );
    }

    return this.commandBus.execute(
      new IntroduceCardCommand(cmd.userId, 'GRAMMAR_ATOM', cmd.atomId, undefined, true),
    );
  }
}
