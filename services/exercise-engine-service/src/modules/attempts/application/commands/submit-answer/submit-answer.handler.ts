import { createHash } from 'node:crypto';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { SubmitAnswerCommand } from './submit-answer.command.js';
import { ATTEMPT_REPOSITORY, type IAttemptRepository } from '../../../domain/repositories/attempt.repository.js';
import { CONTENT_CLIENT, type IContentClient, ContentClientError } from '../../../../../shared/application/ports/content-client.port.js';
import { ANSWER_VALIDATOR, type IAnswerValidator, ValidationError } from '../../../../../shared/application/ports/answer-validator.port.js';
import { FEEDBACK_GENERATOR, type IFeedbackGenerator } from '../../../../../shared/application/ports/feedback-generator.port.js';
import { LEARNING_CLIENT, type ILearningClient, LearningClientError } from '../../../../../shared/application/ports/learning-client.port.js';
import { EVENT_PUBLISHER, type IEventPublisher } from '../../../../../shared/application/ports/event-publisher.port.js';
import { Result } from '../../../../../shared/kernel/result.js';
import type { AttemptDomainError } from '../../../domain/exceptions/attempt.errors.js';

export type SubmitAnswerError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  | { code: 'FORBIDDEN' }
  | ValidationError
  | ContentClientError
  | LearningClientError
  | AttemptDomainError;

export interface SubmitAnswerResult {
  attemptId: string;
  correct: boolean;
  score: number | null;
  requiresReview: boolean;
  feedback: { summary: string; hints?: string[]; correctAnswer?: unknown };
}

@CommandHandler(SubmitAnswerCommand)
export class SubmitAnswerHandler implements ICommandHandler<SubmitAnswerCommand> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
    @Inject(ANSWER_VALIDATOR) private readonly validator: IAnswerValidator,
    @Inject(FEEDBACK_GENERATOR) private readonly feedbackGenerator: IFeedbackGenerator,
    @Inject(LEARNING_CLIENT) private readonly learningClient: ILearningClient,
    @Inject(EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
  ) {}

  async execute(
    command: SubmitAnswerCommand,
  ): Promise<Result<SubmitAnswerResult, SubmitAnswerError>> {
    const attempt = await this.attempts.findById(command.attemptId);
    if (!attempt) {
      return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });
    }
    if (attempt.userId !== command.userId) {
      return Result.fail({ code: 'FORBIDDEN' });
    }

    attempt.addTimeSpent(command.timeSpentSeconds);

    const answerHash = createHash('sha256')
      .update(JSON.stringify(command.submittedAnswer))
      .digest('hex');

    const submitResult = attempt.submit(command.submittedAnswer, answerHash);
    if (submitResult.isFail) {
      return Result.fail(submitResult.error as AttemptDomainError);
    }

    // Fetch exercise definition for validation
    const defResult = await this.contentClient.getExerciseForAttempt(
      attempt.exerciseId,
      attempt.targetLanguage,
    );
    if (defResult.isFail) {
      return Result.fail(defResult.error);
    }
    const def = defResult.value;

    const checkSettings: Record<string, unknown> = {
      ...(def.template.defaultCheckSettings ?? {}),
      ...(def.exercise.answerCheckSettings ?? {}),
    };

    const validationResult = await this.validator.validate({
      templateCode: attempt.templateCode,
      answerSchema: def.template.answerSchema as object,
      expectedAnswers: def.exercise.expectedAnswers,
      submittedAnswer: command.submittedAnswer,
      checkSettings,
      targetLanguage: attempt.targetLanguage,
    });

    if (validationResult.isFail) {
      return Result.fail(validationResult.error);
    }

    const outcome = validationResult.value;
    const passingThreshold = (checkSettings['passingThreshold'] as number | undefined) ?? 70;

    if (outcome.requiresReview) {
      const routeResult = attempt.routeForReview();
      if (routeResult.isFail) {
        return Result.fail(routeResult.error as AttemptDomainError);
      }

      await this.attempts.save(attempt);
      await this.publishEvents(attempt);

      return Result.ok<SubmitAnswerResult, SubmitAnswerError>({
        attemptId: attempt.id,
        correct: false,
        score: null,
        requiresReview: true,
        feedback: { summary: 'Your answer has been submitted for review.' },
      });
    }

    const passed = outcome.score >= passingThreshold;
    const feedbackResult = await this.feedbackGenerator.generate({
      templateCode: attempt.templateCode,
      correct: outcome.correct,
      score: outcome.score,
      validationDetails: outcome.details,
      exerciseDefinition: {
        exercise: def.exercise,
        template: def.template,
        instruction: def.instruction,
      },
      locale: command.locale,
    });
    const feedback = feedbackResult.isOk
      ? feedbackResult.value
      : { summary: outcome.correct ? 'Correct!' : 'Incorrect. Please try again.' };

    const scoreResult = attempt.score(outcome.score, passed, outcome.details, feedback);
    if (scoreResult.isFail) {
      return Result.fail(scoreResult.error as AttemptDomainError);
    }

    await this.attempts.save(attempt);
    await this.publishEvents(attempt);

    // Fire-and-forget: notify Learning Service (non-blocking)
    this.learningClient
      .createSubmission({
        assignmentId: attempt.assignmentId,
        exerciseId: attempt.exerciseId,
        userId: attempt.userId,
        attemptId: attempt.id,
        submittedAnswer: command.submittedAnswer,
        timeSpentSeconds: attempt.timeSpentSeconds,
      })
      .catch(() => undefined);

    return Result.ok<SubmitAnswerResult, SubmitAnswerError>({
      attemptId: attempt.id,
      correct: outcome.correct,
      score: outcome.score,
      requiresReview: false,
      feedback,
    });
  }

  private async publishEvents(attempt: import('../../../domain/entities/attempt.entity.js').Attempt): Promise<void> {
    for (const event of attempt.getDomainEvents()) {
      await this.publisher.publish(event.eventType, event.payload);
    }
    attempt.clearDomainEvents();
  }
}
