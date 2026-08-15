import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import {
  readContent,
  toStudentProjection,
  TEMPLATE_CODE as WORD_BANK_GAP_FILL,
} from '@ssz/shared-kernel/wordbank-gapfill';
import {
  fromPersisted as ecFromPersisted,
  toStudentProjection as ecToStudentProjection,
  TEMPLATE_CODE as ERROR_CORRECTION,
} from '@ssz/shared-kernel/error-correction';
import {
  fromPersisted as trFromPersisted,
  isTranslateCode,
  toStudentProjection as trToStudentProjection,
} from '@ssz/shared-kernel/translate';
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
  checkMode: string;
  exerciseContent: unknown;
  // null when checkMode is GRADED.
  expectedAnswers: unknown;
  answerSchema: unknown;
  checkSettings: Record<string, unknown>;
}

/**
 * What the client may hold once the attempt starts.
 *
 * `checkMode: PRACTICE` normally means "ship the answers so the client can check
 * locally", and for eleven templates that is fine: their answers are a separate key,
 * and the content is just the question. `word_bank_gap_fill` stores each sentence
 * solved, so its content *is* the answer key — shipping it in PRACTICE would put every
 * answer in the browser at the moment the exercise opens, whatever the attempt's mode.
 *
 * `error_correction` is the second such template, for a subtler reason: its key is a
 * separate field, but the mistakes the student is hunting for are *derived* from it. A
 * browser holding the key holds the answer to "which words are wrong", which is the
 * whole exercise — so it gets counts and types instead, and never the words.
 *
 * The translate pair is the third, and the plainest of them: `expectedAnswers` there is a
 * list of accepted translations, which is the exercise typed out. The projection keeps the
 * sentence, the hint and the glosses, and drops the key, the guards (`require: ["har
 * bodd"]` hands over two words of it) and the author's explanations.
 *
 * The masking rules are the kernel's, shared with content-service and the builders;
 * only the shuffle is local, because a shuffle cannot live in a module that must be pure.
 */
function withheldWhereNeeded(
  templateCode: string,
  exercise: { content: unknown; expectedAnswers: unknown },
): { exerciseContent: unknown; expectedAnswers: unknown } {
  if (templateCode === WORD_BANK_GAP_FILL) {
    return {
      exerciseContent: toStudentProjection(readContent(exercise.content), { shuffle: shuffled }),
      expectedAnswers: null,
    };
  }

  if (templateCode === ERROR_CORRECTION) {
    // The projection needs the key in order to take it away — it counts the spans it
    // derives from it — so the document is assembled first and masked second.
    const document = ecFromPersisted(
      { id: '', moduleId: '', title: '', instructions: '', updatedAt: '' },
      exercise.content,
      exercise.expectedAnswers,
    );
    return { exerciseContent: ecToStudentProjection(document), expectedAnswers: null };
  }

  if (isTranslateCode(templateCode)) {
    const document = trFromPersisted(
      { id: '', moduleId: '', title: '', instructions: '', updatedAt: '' },
      templateCode,
      exercise.content,
      exercise.expectedAnswers,
    );
    return { exerciseContent: trToStudentProjection(document), expectedAnswers: null };
  }

  return { exerciseContent: exercise.content, expectedAnswers: exercise.expectedAnswers };
}

/** Fisher-Yates over a copy, seeded by the platform CSPRNG rather than Math.random. */
function shuffled(words: string[]): string[] {
  const out = [...words];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
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
      command.checkMode,
    );
    if (defResult.isFail) {
      return Result.fail<StartAttemptResult, StartAttemptError>(defResult.error);
    }

    // Best-effort — a relation-graph hiccup must not block starting the attempt;
    // it only means this attempt won't feed the SRS fan-out on scoring.
    const atomsResult = await this.contentClient.getPracticedAtoms(command.exerciseId);
    const practicedAtoms = atomsResult.isOk ? atomsResult.value : [];

    const def = defResult.value;
    const attempt = Attempt.create({
      userId: command.userId,
      exerciseId: command.exerciseId,
      assignmentId: command.assignmentId,
      enrollmentId: command.enrollmentId,
      templateCode: def.exercise.templateCode,
      targetLanguage: def.exercise.targetLanguage,
      difficultyLevel: def.exercise.difficultyLevel as DifficultyLevel,
      checkMode: command.checkMode,
      practicedAtoms,
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
      checkMode: attempt.checkMode,
      ...withheldWhereNeeded(def.exercise.templateCode, def.exercise),
      answerSchema: def.template.answerSchema,
      checkSettings,
    });
  }
}
