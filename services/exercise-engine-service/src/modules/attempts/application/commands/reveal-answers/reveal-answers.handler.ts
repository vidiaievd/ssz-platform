import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { fromPersisted, gaps, feedbackFor, TEMPLATE_CODE } from '@ssz/shared-kernel/wordbank-gapfill';
import {
  completePairs,
  feedbackFor as mpFeedbackFor,
  fromPersisted as mpFromPersisted,
  TEMPLATE_CODE as MATCH_PAIRS,
} from '@ssz/shared-kernel/match-pairs';
import { RevealAnswersCommand } from './reveal-answers.command.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../domain/repositories/attempt.repository.js';
import {
  CONTENT_CLIENT,
  type IContentClient,
  ContentClientError,
} from '../../../../../shared/application/ports/content-client.port.js';
import { Result } from '../../../../../shared/kernel/result.js';
import type { AttemptDomainError } from '../../../domain/exceptions/attempt.errors.js';

export type RevealAnswersError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  | { code: 'FORBIDDEN' }
  | { code: 'UNSUPPORTED_TEMPLATE' }
  | ContentClientError
  | AttemptDomainError;

export interface RevealedGap {
  gapKey: string;
  label: string;
  word: string;
  /** The teacher's note on why this word is right, when they wrote one. */
  why: string | null;
}

/** One left half and the right half that completes it. */
export interface RevealedSlot {
  /** The slot the student was filling — `content.pairs[].id`. */
  pairId: string;
  /** Its own half as a pool item, so the client can show which chip belonged here. */
  rightId: string;
  text: string;
  /** The teacher's note on why this half is the right one, when they wrote one. */
  why: string | null;
}

/**
 * Discriminated by template, because "the answer" is a different shape per type and
 * flattening them would leave every client guessing which fields are populated.
 *
 * `templateCode` is additive: the gap-fill payload is unchanged down to the field
 * names, so a client that only knows about gaps keeps working and can ignore it.
 */
export type RevealAnswersResult =
  | {
      attemptId: string;
      templateCode: typeof TEMPLATE_CODE;
      answers: RevealedGap[];
      attemptClosed: boolean;
    }
  | {
      attemptId: string;
      templateCode: typeof MATCH_PAIRS;
      answers: RevealedSlot[];
      attemptClosed: boolean;
    };

/**
 * The templates that withhold their answers, and so are the only ones with anything to
 * reveal. For the rest the client already holds the key, and a reveal endpoint would be
 * ceremony around something it can do itself.
 */
const REVEALABLE = new Set<string>([TEMPLATE_CODE, MATCH_PAIRS]);

/**
 * The only place answer text leaves this service.
 *
 * Everything else about `word_bank_gap_fill` and `match_pairs` is arranged so that a
 * learner who is wrong is told *why* and not *what*: the student projection cuts the
 * answers out of the sentences (and the pairing out of the pool), and grading returns a
 * verdict and an explanation per gap or per slot. Being wrong is not a way to be given
 * the answer — asking is, and asking is recorded, because an attempt whose answers were
 * shown is weaker evidence of knowing them (docs/plan/36-srs-evidence-strength.md).
 */
@CommandHandler(RevealAnswersCommand)
export class RevealAnswersHandler implements ICommandHandler<RevealAnswersCommand> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
  ) {}

  async execute(
    command: RevealAnswersCommand,
  ): Promise<Result<RevealAnswersResult, RevealAnswersError>> {
    const attempt = await this.attempts.findById(command.attemptId);
    if (!attempt) {
      return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });
    }
    if (attempt.userId !== command.userId) {
      return Result.fail({ code: 'FORBIDDEN' });
    }
    if (!REVEALABLE.has(attempt.templateCode)) {
      return Result.fail({ code: 'UNSUPPORTED_TEMPLATE' });
    }

    const revealResult = attempt.revealAnswers();
    if (revealResult.isFail) {
      return Result.fail(revealResult.error as AttemptDomainError);
    }

    const defResult = await this.contentClient.getExerciseForAttempt(
      attempt.exerciseId,
      attempt.targetLanguage,
      'PRACTICE',
    );
    if (defResult.isFail) {
      return Result.fail(defResult.error);
    }
    const def = defResult.value;

    const envelope = {
      id: attempt.exerciseId,
      moduleId: '',
      title: '',
      instructions: '',
      updatedAt: '',
    };

    // The attempt was already closed by submitting; the reveal records that the
    // learner was shown the answers rather than working them out.
    const revealed =
      attempt.templateCode === MATCH_PAIRS
        ? this.revealPairs(attempt.id, envelope, def.exercise)
        : this.revealGaps(attempt.id, envelope, def.exercise);

    await this.attempts.save(attempt);

    return Result.ok<RevealAnswersResult, RevealAnswersError>(revealed);
  }

  private revealGaps(
    attemptId: string,
    envelope: { id: string; moduleId: string; title: string; instructions: string; updatedAt: string },
    exercise: { content: unknown; expectedAnswers: unknown },
  ): RevealAnswersResult {
    const document = fromPersisted(envelope, exercise.content, exercise.expectedAnswers);

    const answers: RevealedGap[] = gaps(document).map((gap) => {
      const why = feedbackFor(document, gap.key).why.trim();
      return { gapKey: gap.key, label: gap.label, word: gap.answer, why: why === '' ? null : why };
    });

    return { attemptId, templateCode: TEMPLATE_CODE, answers, attemptClosed: true };
  }

  private revealPairs(
    attemptId: string,
    envelope: { id: string; moduleId: string; title: string; instructions: string; updatedAt: string },
    exercise: { content: unknown; expectedAnswers: unknown },
  ): RevealAnswersResult {
    const document = mpFromPersisted(envelope, exercise.content, exercise.expectedAnswers);

    // Complete pairs only — the same set the student was given slots for. A half-written
    // pair has no slot to reveal into.
    const answers: RevealedSlot[] = completePairs(document).map((pair) => {
      const why = mpFeedbackFor(document, pair.id).why.trim();
      return {
        pairId: pair.id,
        rightId: pair.rightId,
        text: pair.right,
        why: why === '' ? null : why,
      };
    });

    return { attemptId, templateCode: MATCH_PAIRS, answers, attemptClosed: true };
  }
}
