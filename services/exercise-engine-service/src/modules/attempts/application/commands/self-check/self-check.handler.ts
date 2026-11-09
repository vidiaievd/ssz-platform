import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { TEMPLATE_CODE } from '@ssz/shared-kernel/error-correction';
import type { StudentEdits } from '@ssz/shared-kernel/error-correction';
import { isTranslateCode } from '@ssz/shared-kernel/translate';
import { SelfCheckCommand } from './self-check.command.js';
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
import {
  gradeErrorCorrection,
  gradeTranslate,
  readEcDraft,
  readTrDraft,
  type SelfCheckPayload,
} from '../../services/self-check-grading.js';

export type { SelfCheckPayload };

export type SelfCheckError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  | { code: 'FORBIDDEN' }
  | { code: 'UNSUPPORTED_TEMPLATE' }
  | { code: 'SCHEMA_MISMATCH' }
  | ContentClientError
  | AttemptDomainError;

export type SelfCheckResult = {
  attemptId: string;
  /** Including the one just spent. */
  checksUsed: number;
  checksLeft: number;
} & SelfCheckPayload;

/**
 * "How am I doing so far?", answered mid-attempt.
 *
 * It is a server round-trip for the same reason grading is: the answer to it is derived
 * from the answer key, and the key never reaches the browser. What comes back is counts
 * and mistake types — never which words are wrong, which is the rule both templates that
 * offer a self-check are arranged around (BEHAVIOR.md §C.1).
 *
 * It is also rationed. Unlimited self-checks turn the exercise into a search: in error
 * correction, mark a word, ask, unmark, ask again, and the count differences spell out
 * where the mistakes are; in translate, the diff would give up the key one word per call —
 * which is why the words of the key are masked there on top of the budget. The budget is
 * the author's (`flow.selfCheck`), and the spending is counted on the attempt rather than
 * trusted to the client.
 */
@CommandHandler(SelfCheckCommand)
export class SelfCheckHandler implements ICommandHandler<SelfCheckCommand> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
  ) {}

  async execute(command: SelfCheckCommand): Promise<Result<SelfCheckResult, SelfCheckError>> {
    const attempt = await this.attempts.findById(command.attemptId);
    if (!attempt) {
      return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });
    }
    if (attempt.userId !== command.userId) {
      return Result.fail({ code: 'FORBIDDEN' });
    }
    // No other template needs one: they either ship their answers to the client, or
    // their "how am I doing" is the submission itself.
    const templateCode = attempt.templateCode;
    const translate = isTranslateCode(templateCode);
    if (templateCode !== TEMPLATE_CODE && !translate) {
      return Result.fail({ code: 'UNSUPPORTED_TEMPLATE' });
    }

    // Read the draft before fetching anything: a malformed one is a client bug, and a
    // client bug should cost neither a round-trip for the key nor one of the student's
    // checks.
    const draft = translate ? readTrDraft(command.draftAnswer) : readEcDraft(command.draftAnswer);
    if (draft === null) {
      return Result.fail({ code: 'SCHEMA_MISMATCH' });
    }

    // PRACTICE rather than the attempt's own mode: this needs the answer key server-side
    // whatever the attempt ships to the client, and nothing derived from it goes back.
    const defResult = await this.contentClient.getExerciseForAttempt(
      attempt.exerciseId,
      attempt.targetLanguage,
      'PRACTICE',
    );
    if (defResult.isFail) {
      return Result.fail(defResult.error);
    }

    const envelope = {
      id: attempt.exerciseId,
      moduleId: '',
      title: '',
      instructions: '',
      updatedAt: '',
    };
    const { content, expectedAnswers } = defResult.value.exercise;

    const graded = translate
      ? gradeTranslate(
          templateCode,
          envelope,
          content,
          expectedAnswers,
          draft as Record<string, string>,
        )
      : gradeErrorCorrection(
          envelope,
          content,
          expectedAnswers,
          draft as Record<string, StudentEdits>,
        );

    const spend = attempt.useSelfCheck(graded.budget);
    if (spend.isFail) {
      return Result.fail(spend.error as AttemptDomainError);
    }

    await this.attempts.save(attempt);

    return Result.ok<SelfCheckResult, SelfCheckError>({
      attemptId: attempt.id,
      checksUsed: attempt.selfChecksUsed,
      checksLeft: Math.max(0, graded.budget - attempt.selfChecksUsed),
      ...graded.payload,
    });
  }
}
