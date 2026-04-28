import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { StartAttemptCommand } from './start-attempt.command.js';
import { Attempt } from '../../../domain/entities/attempt.entity.js';
import type { DifficultyLevel } from '../../../domain/entities/attempt.entity.js';
import { ATTEMPT_REPOSITORY, type IAttemptRepository } from '../../../domain/repositories/attempt.repository.js';
import { CONTENT_CLIENT, type IContentClient, ContentClientError } from '../../../../../shared/application/ports/content-client.port.js';
import { EVENT_PUBLISHER, type IEventPublisher } from '../../../../../shared/application/ports/event-publisher.port.js';
import { Result } from '../../../../../shared/kernel/result.js';

export type StartAttemptError =
  | ContentClientError
  | { code: 'ALREADY_IN_PROGRESS'; attemptId: string };

export interface StartAttemptResult {
  attemptId: string;
  templateCode: string;
  targetLanguage: string;
  difficultyLevel: string;
  exerciseContent: unknown;
  expectedAnswers: unknown;
  answerSchema: unknown;
  checkSettings: Record<string, unknown>;
}

@CommandHandler(StartAttemptCommand)
export class StartAttemptHandler implements ICommandHandler<StartAttemptCommand> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
    @Inject(EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
  ) {}

  async execute(
    command: StartAttemptCommand,
  ): Promise<Result<StartAttemptResult, StartAttemptError>> {
    // Resume existing in-progress attempt if present
    const existing = await this.attempts.findInProgress(command.userId, command.exerciseId);
    if (existing) {
      return Result.fail<StartAttemptResult, StartAttemptError>({
        code: 'ALREADY_IN_PROGRESS',
        attemptId: existing.id,
      });
    }

    const defResult = await this.contentClient.getExerciseForAttempt(
      command.exerciseId,
      command.language,
    );
    if (defResult.isFail) {
      return Result.fail<StartAttemptResult, StartAttemptError>(defResult.error);
    }

    const def = defResult.value;
    const attempt = Attempt.create({
      userId: command.userId,
      exerciseId: command.exerciseId,
      assignmentId: command.assignmentId,
      enrollmentId: command.enrollmentId,
      templateCode: def.exercise.templateCode,
      targetLanguage: def.exercise.targetLanguage,
      difficultyLevel: def.exercise.difficultyLevel as DifficultyLevel,
    });

    await this.attempts.save(attempt);

    for (const event of attempt.getDomainEvents()) {
      await this.publisher.publish(event.eventType, event.payload);
    }
    attempt.clearDomainEvents();

    const checkSettings: Record<string, unknown> = {
      ...(def.template.defaultCheckSettings ?? {}),
      ...(def.exercise.answerCheckSettings ?? {}),
    };

    return Result.ok<StartAttemptResult, StartAttemptError>({
      attemptId: attempt.id,
      templateCode: def.exercise.templateCode,
      targetLanguage: def.exercise.targetLanguage,
      difficultyLevel: def.exercise.difficultyLevel,
      exerciseContent: def.exercise.content,
      expectedAnswers: def.exercise.expectedAnswers,
      answerSchema: def.template.answerSchema,
      checkSettings,
    });
  }
}
