import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import type { FlaggedAtom } from '@ssz/contracts';
import { SRS_REPOSITORY, type ISrsRepository } from '../../domain/repositories/srs-repository.interface.js';
import {
  ATOM_FLAG_LOG,
  type AtomFlagOutcome,
  type AtomFlagSource,
  type IAtomFlagLog,
} from '../../domain/repositories/atom-flag-log.interface.js';
import { SHADOW_CONTENT_TYPES, type ReviewCard } from '../../domain/entities/review-card.entity.js';
import { RedisDueQueueService } from '../../infrastructure/cache/redis-due-queue.service.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import { ApplyFlaggedAtomsCommand } from './apply-flagged-atoms.command.js';
import { ReviewCardCommand } from './review-card.command.js';

const GRAMMAR_RULE_ATOM = 'grammar_rule_atom';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rule atoms a check named as the ground of a mistake, applied to the learner's cards
 * (plan 85, step 5, §1).
 *
 * - **A model's signal** (`ai_precheck`, `ai_review`, `ai_voice`) only brings the card due within a day
 *   (`min(dueAt, now + 1 day)`, rule 2). It never rates: a rehearsal may be pressed as often as
 *   the learner likes, and a rating from it could be farmed (rule 1).
 * - **A teacher's mark** outside the exercise's targets is a real failure — the card is rated
 *   AGAIN (rule 5). On one of the targets it is left alone: the hand-in's `attempt.completed`
 *   rated that card already, and a second rating of the same answer would read as a review at
 *   an interval that never happened.
 * - **No card** — nothing here. Whether the rule is offered to the learner ("worth repeating")
 *   or was never reached is the screen's question (step 7), answered from the learner's atoms.
 *
 * Every grammar atom leaves a row in `atom_flags`, and the row comes first: one signal per
 * (learner, exercise, atom, source) a UTC day (rule 3), so a second rehearsal the same day finds
 * its row and changes nothing. Atoms of other kinds are not this plan's and are skipped — the
 * `sound` atoms a reading's voice check names (`ai_voice`, plan 88) wait for their cards (plan 86).
 *
 * `GRAMMAR_ATOM` cards are still shadow cards (plan 63 phase 5): a pulled due date changes no
 * queue a learner sees until phase 7, and that is the card that will carry it then.
 */
@CommandHandler(ApplyFlaggedAtomsCommand)
export class ApplyFlaggedAtomsHandler implements ICommandHandler<ApplyFlaggedAtomsCommand, AtomFlagOutcome[]> {
  private readonly logger = new Logger(ApplyFlaggedAtomsHandler.name);

  constructor(
    @Inject(SRS_REPOSITORY) private readonly repo: ISrsRepository,
    @Inject(ATOM_FLAG_LOG) private readonly flags: IAtomFlagLog,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly dueQueue: RedisDueQueueService,
    private readonly commandBus: CommandBus,
  ) {}

  /** What became of each grammar atom that was not a repeat today, in the letter's order. */
  async execute({ payload: p }: ApplyFlaggedAtomsCommand): Promise<AtomFlagOutcome[]> {
    const now = this.clock.now();
    const flaggedOn = utcDay(p.occurredAt, now);
    const applied: AtomFlagOutcome[] = [];

    for (const atom of p.atoms) {
      if (atom.atomType !== GRAMMAR_RULE_ATOM) continue;

      const card = await this.repo.findByUserAndContent(p.userId, 'GRAMMAR_ATOM', atom.atomId);
      const outcome = decide(card, p.source, atom, now);
      const recorded = await this.flags.record({
        userId: p.userId,
        exerciseId: p.exerciseId,
        attemptId: p.attemptId,
        atomType: atom.atomType,
        atomId: atom.atomId,
        source: p.source,
        inExerciseTargets: atom.inExerciseTargets,
        outcome,
        flaggedOn,
        schoolId: p.schoolId ?? null,
        containerId: p.containerId ?? null,
        groupId: p.groupId ?? null,
      });
      if (recorded === 'duplicate') continue;

      if (outcome === 'pulled') await this.pull(card!, now);
      if (outcome === 'lapsed') await this.lapse(card!, now);
      applied.push(outcome);
    }
    return applied;
  }

  private async pull(card: ReviewCard, now: Date): Promise<void> {
    card.pullDueTo(new Date(now.getTime() + DAY_MS), now);
    await this.repo.save(card);
    // A shadow card is kept out of the cached due queue, as `ReviewCardHandler` keeps it.
    if (!SHADOW_CONTENT_TYPES.includes(card.contentType)) {
      await this.dueQueue.upsert(card.userId, card.id, card.dueAt, card.track);
    }
  }

  /**
   * Through `ReviewCardCommand`, as every rating is: the scheduler, the events and the shadow
   * rules are its. A teacher's mark is not the learner's work, so a shadow card skips the
   * learner's daily quota there exactly as a rating from an attempt does.
   */
  private async lapse(card: ReviewCard, now: Date): Promise<void> {
    const rated = await this.commandBus.execute(
      new ReviewCardCommand(
        card.userId,
        card.id,
        'AGAIN',
        now,
        undefined,
        undefined,
        SHADOW_CONTENT_TYPES.includes(card.contentType),
      ),
    );
    if (rated?.isFail) {
      this.logger.warn(`Teacher's lapse on card ${card.id} not applied: ${rated.error?.message ?? 'unknown'}`);
    }
  }
}

function decide(card: ReviewCard | null, source: AtomFlagSource, atom: FlaggedAtom, now: Date): AtomFlagOutcome {
  if (card === null) return 'no_card';
  if (card.state === 'SUSPENDED') return 'suspended';
  if (source === 'teacher') return atom.inExerciseTargets ? 'in_targets' : 'lapsed';
  return card.dueAt.getTime() <= now.getTime() + DAY_MS ? 'already_due' : 'pulled';
}

/** Midnight UTC of the signal's day; today when the payload's time is missing or unreadable. */
function utcDay(occurredAt: string | undefined, fallback: Date): Date {
  const at = occurredAt ? new Date(occurredAt) : fallback;
  const day = Number.isNaN(at.getTime()) ? fallback : at;
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
}
