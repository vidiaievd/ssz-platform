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
import { ATOM_CARD_TYPES, SHADOW_CONTENT_TYPES, type ReviewCard } from '../../domain/entities/review-card.entity.js';
import { RedisDueQueueService } from '../../infrastructure/cache/redis-due-queue.service.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import { ApplyFlaggedAtomsCommand } from './apply-flagged-atoms.command.js';
import { ReviewCardCommand } from './review-card.command.js';
import { IntroduceCardCommand } from './introduce-card.command.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A sound with no card gets one when it is flagged again on another day (plan 86 §4y.1, Q19):
 * on this many distinct UTC days within the window, today included. One low score from Azure
 * is noise; the same family failing on two days is the learner. The toneme needs three — one
 * word's verdict is wrong about 18 % of the time (plan 88 Q4).
 */
const SOUND_REPEAT_WINDOW_DAYS = 14;
const SOUND_REPEAT_DAYS = 2;
const TONE_REPEAT_DAYS = 3;

/**
 * Rule atoms a check named as the ground of a mistake, applied to the learner's cards
 * (plan 85, step 5, §1).
 *
 * - **A model's signal** (`ai_precheck`, `ai_review`, `ai_voice`, `ai_session`) only brings the card due within a day
 *   (`min(dueAt, now + 1 day)`, rule 2). It never rates: a rehearsal may be pressed as often as
 *   the learner likes, and a rating from it could be farmed (rule 1).
 * - **A teacher's mark** outside the exercise's targets is a real failure — the card is rated
 *   AGAIN (rule 5). On one of the targets it is left alone: the hand-in's `attempt.completed`
 *   rated that card already, and a second rating of the same answer would read as a review at
 *   an interval that never happened.
 * - **No card** — nothing here. Whether the rule is offered to the learner ("worth repeating")
 *   or was never reached is the screen's question (step 7), answered from the learner's atoms.
 *
 * Every carded atom leaves a row in `atom_flags`, and the row comes first: one signal per
 * (learner, exercise, atom, source) a UTC day (rule 3), so a second rehearsal the same day finds
 * its row and changes nothing. Carded are grammar atoms and, since plan 86 step 8.3, `sound`
 * families (`nb:kj`, flagged by the voice check and the rehearsal); words are skipped.
 *
 * A sound differs in one place: with no card, a flag on a second distinct day of a fortnight
 * (the toneme: a third) introduces the card — reading aloud outside a course is how most
 * learners meet the check, and without this a weak sound would never come back. The flag
 * still never rates it. A pronunciation session's flag (`ai_session`, plan 86 step 13.5b) never
 * introduces one: the session that heard the sound plans it next time and rates it itself (§5.5,
 * Q31) — but its day still counts towards another source's repeat.
 *
 * Both card types are still shadow cards (plan 63 phase 5): a pulled due date changes no
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

  /** What became of each carded atom that was not a repeat today, in the letter's order. */
  async execute({ payload: p }: ApplyFlaggedAtomsCommand): Promise<AtomFlagOutcome[]> {
    const now = this.clock.now();
    const flaggedOn = utcDay(p.occurredAt, now);
    const applied: AtomFlagOutcome[] = [];

    for (const atom of p.atoms) {
      const contentType = ATOM_CARD_TYPES[atom.atomType];
      if (!contentType) continue;

      const card = await this.repo.findByUserAndContent(p.userId, contentType, atom.atomId);
      let outcome = decide(card, p.source, atom, now);
      if (
        outcome === 'no_card' &&
        contentType === 'SOUND_ATOM' &&
        p.source !== 'ai_session' &&
        (await this.repeated(p.userId, atom, flaggedOn))
      ) {
        outcome = 'introduced';
      }
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
      if (outcome === 'introduced') await this.introduce(p.userId, atom.atomId);
      applied.push(outcome);
    }
    return applied;
  }

  /** Flagged on enough other days of the window that today's flag makes it a pattern. */
  private async repeated(userId: string, atom: FlaggedAtom, today: Date): Promise<boolean> {
    const from = new Date(today.getTime() - (SOUND_REPEAT_WINDOW_DAYS - 1) * DAY_MS);
    const earlier = await this.flags.flaggedDays(userId, atom.atomType, atom.atomId, from, today);
    const needed = atom.atomId.endsWith(':tone') ? TONE_REPEAT_DAYS : SOUND_REPEAT_DAYS;
    return earlier + 1 >= needed;
  }

  /**
   * A new shadow card, not rated: a model's flag never rates (rule 1), and a card new today
   * is due today anyway, so there is nothing to pull either.
   */
  private async introduce(userId: string, atomId: string): Promise<void> {
    const introduced = await this.commandBus.execute(
      new IntroduceCardCommand(userId, 'SOUND_ATOM', atomId, undefined, true),
    );
    if (introduced?.isFail) {
      this.logger.warn(`Sound card ${atomId} for user ${userId} not introduced: ${introduced.error?.message ?? 'unknown'}`);
    }
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
