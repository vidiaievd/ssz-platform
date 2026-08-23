import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import {
  fromPersisted,
  grade,
  isShortAnswerDocument,
  TEMPLATE_CODE as SHORT_ANSWER,
  toStudentResult,
  usableElements,
} from '@ssz/shared-kernel/short-answer';
import type { StudentResult } from '@ssz/shared-kernel/short-answer';
import { AnswerQuestionCommand } from './answer-question.command.js';
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

export type AnswerQuestionError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  | { code: 'FORBIDDEN' }
  | { code: 'UNSUPPORTED_TEMPLATE' }
  | { code: 'QUESTION_NOT_FOUND' }
  | { code: 'EMPTY_ANSWER' }
  | ContentClientError
  | AttemptDomainError;

export interface AnswerQuestionResult {
  attemptId: string;
  /** How many of the set have been handed in, including this one. */
  answered: number;
  /** How many there are to answer. */
  total: number;
  /** The verdict and everything the student is allowed to see behind it. */
  result: StudentResult;
  /** Whether this answer is on its way to a teacher, for the routing line. */
  routedForReview: boolean;
}

/**
 * Hand in one question of a `short_answer` set.
 *
 * The design is a question at a time: the student writes, presses `Lever svaret`, is
 * told what their answer covered, and moves on with no way back. IMPLEMENTATION.md
 * proposes `POST /attempts/:id/answers` for it. What it cannot propose, because it does
 * not know this platform, is that an attempt here is the unit of everything else —
 * progress, spaced repetition, the review queue, the locks, the notifications are all
 * built on "one attempt, one submission, one thing a teacher marks" (plans 43-47).
 *
 * So the attempt stays one attempt and the answers arrive one at a time onto it. This is
 * a command on an existing attempt, modelled on `self-check` and pointedly not one: a
 * self-check is rationed, records nothing and can be asked again, while this is final,
 * is written down, and is refused the second time (`Attempt.answerQuestion`).
 *
 * Grading happens here, on the server, and it has to: the anchor phrases the answer is
 * matched against are the answer itself, written in the words the student is being asked
 * to find. What comes back is the kernel's own student projection of the result — the
 * element labels with a hit flag, never the phrase that matched, and the model answer
 * only when `showModel` allows it.
 *
 * Closing the attempt is still `submit`, with every answer in one aggregate, and it
 * regrades all of them from scratch. Nothing decided here is trusted there: a verdict
 * that reached the client is a verdict a client could send back.
 */
@CommandHandler(AnswerQuestionCommand)
export class AnswerQuestionHandler implements ICommandHandler<AnswerQuestionCommand> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
  ) {}

  async execute(
    command: AnswerQuestionCommand,
  ): Promise<Result<AnswerQuestionResult, AnswerQuestionError>> {
    const attempt = await this.attempts.findById(command.attemptId);
    if (!attempt) {
      return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });
    }
    if (attempt.userId !== command.userId) {
      return Result.fail({ code: 'FORBIDDEN' });
    }
    if (attempt.templateCode !== SHORT_ANSWER) {
      return Result.fail({ code: 'UNSUPPORTED_TEMPLATE' });
    }
    // `Lever svaret` is disabled on an empty field, and an empty answer handed in anyway
    // would be a `fail` the student can never revisit. Refused before anything is written
    // down, where it is still a client bug rather than a lost question.
    if (command.text.trim() === '') {
      return Result.fail({ code: 'EMPTY_ANSWER' });
    }

    // PRACTICE rather than the attempt's own mode: the key is needed here whatever the
    // attempt ships to the client, and only the projection of the result goes back.
    const defResult = await this.contentClient.getExerciseForAttempt(
      attempt.exerciseId,
      attempt.targetLanguage,
      'PRACTICE',
    );
    if (defResult.isFail) {
      return Result.fail(defResult.error);
    }

    const { content, expectedAnswers } = defResult.value.exercise;
    // A document of the old form has one question and no ids to hand in against; it is
    // answered by submitting, as it always was (plan 51 §8 Q1).
    if (!isShortAnswerDocument(content)) {
      return Result.fail({ code: 'UNSUPPORTED_TEMPLATE' });
    }

    const document = fromPersisted(content, expectedAnswers);
    const question = document.questions.find((q) => q.id === command.questionId);
    // Also the case where the question exists but has no usable key. Answering it would
    // record a `fail` against a question that could never have been passed, and the
    // publish preflight already refuses to ship one.
    if (!question || usableElements(question).length === 0) {
      return Result.fail({ code: 'QUESTION_NOT_FOUND' });
    }

    const result = grade(question, command.text, document.settings);

    const answered = attempt.answerQuestion({
      questionId: command.questionId,
      text: command.text,
      verdict: result.verdict,
    });
    if (answered.isFail) {
      return Result.fail(answered.error as AttemptDomainError);
    }

    await this.attempts.save(attempt);

    const settings = projectedSettings(document.settings);

    return Result.ok<AnswerQuestionResult, AnswerQuestionError>({
      attemptId: attempt.id,
      answered: attempt.answeredQuestions.length,
      // Questions with no usable key are not answerable and are not counted, so the
      // `n/total` the student sees matches the set they are actually walking through.
      total: document.questions.filter((q) => usableElements(q).length > 0).length,
      result: toStudentResult(
        {
          questionId: command.questionId,
          verdict: result.verdict,
          covered: result.covered,
          total: result.total,
          tooShort: result.tooShort,
          hits: result.hits,
          why: question.why,
          model: question.model,
        },
        settings,
      ),
      routedForReview:
        document.settings.teacherReview === 'all' ||
        (document.settings.teacherReview === 'flagged' && result.verdict !== 'pass'),
    });
  }
}

/**
 * The settings the result projection reads, lifted off the document.
 *
 * Only `showBreakdown` and `showModel` change what comes back; the rest are carried
 * because the projection's own contract asks for them, and naming them here rather than
 * spreading the document keeps the AI switches from arriving in a payload by accident.
 */
function projectedSettings(settings: ReturnType<typeof fromPersisted>['settings']) {
  return {
    passRule: settings.passRule,
    passN: settings.passN,
    minWords: settings.minWords,
    showBreakdown: settings.showBreakdown,
    showModel: settings.showModel,
    aiStage: settings.aiStage,
    aiGrammar: settings.aiGrammar,
    teacherReview: settings.teacherReview,
    progress: settings.progress,
  };
}
