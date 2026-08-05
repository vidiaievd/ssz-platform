import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { fromPersisted, gaps, feedbackFor, TEMPLATE_CODE } from '@ssz/shared-kernel/wordbank-gapfill';
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

export interface RevealAnswersResult {
  attemptId: string;
  answers: RevealedGap[];
  attemptClosed: boolean;
}

/**
 * The only place answer text leaves this service.
 *
 * Everything else about `word_bank_gap_fill` is arranged so that a learner who is
 * wrong is told *why* and not *what*: the student projection cuts the answers out of
 * the sentences, and grading returns a verdict and an explanation per gap. Being wrong
 * is not a way to be given the word — asking is, and asking is recorded, because an
 * attempt whose answers were shown is weaker evidence of knowing them
 * (docs/plan/36-srs-evidence-strength.md).
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
    // Only this template hides its answers from the client in the first place. For
    // the other twelve the client already holds them, so a reveal endpoint would be
    // ceremony around something it can do itself.
    if (attempt.templateCode !== TEMPLATE_CODE) {
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

    const document = fromPersisted(
      { id: attempt.exerciseId, moduleId: '', title: '', instructions: '', updatedAt: '' },
      def.exercise.content,
      def.exercise.expectedAnswers,
    );

    const answers: RevealedGap[] = gaps(document).map((gap) => {
      const why = feedbackFor(document, gap.key).why.trim();
      return { gapKey: gap.key, label: gap.label, word: gap.answer, why: why === '' ? null : why };
    });

    await this.attempts.save(attempt);

    return Result.ok<RevealAnswersResult, RevealAnswersError>({
      attemptId: attempt.id,
      answers,
      // The attempt was already closed by submitting; the reveal records that the
      // learner was shown the words rather than working them out.
      attemptClosed: true,
    });
  }
}
