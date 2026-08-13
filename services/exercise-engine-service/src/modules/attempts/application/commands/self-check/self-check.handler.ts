import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import {
  fromPersisted,
  readEdits,
  selfCheckFeedback,
  TEMPLATE_CODE,
} from '@ssz/shared-kernel/error-correction';
import type { SelfCheckItem, StudentEdits } from '@ssz/shared-kernel/error-correction';
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

export type SelfCheckError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  | { code: 'FORBIDDEN' }
  | { code: 'UNSUPPORTED_TEMPLATE' }
  | { code: 'SCHEMA_MISMATCH' }
  | ContentClientError
  | AttemptDomainError;

export interface SelfCheckResult {
  attemptId: string;
  /** Including the one just spent. */
  checksUsed: number;
  checksLeft: number;
  items: SelfCheckItem[];
  fixedCount: number;
  spanCount: number;
}

/**
 * "How am I doing so far?", answered mid-attempt.
 *
 * It is a server round-trip for the same reason grading is: the answer to it is derived
 * from the answer key, and the key never reaches the browser. What comes back is counts
 * and mistake types — never which words are wrong, which is the rule the whole template
 * is arranged around (BEHAVIOR.md §C.1).
 *
 * It is also rationed. Unlimited self-checks turn the exercise into a search: mark a
 * word, ask, unmark, ask again, and the count differences spell out where the mistakes
 * are. The budget is the author's (`flow.selfCheck`, 0–3), and the spending is counted
 * on the attempt rather than trusted to the client.
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
    if (attempt.templateCode !== TEMPLATE_CODE) {
      return Result.fail({ code: 'UNSUPPORTED_TEMPLATE' });
    }

    const edits = readSubmission(command.draftAnswer);
    if (edits === null) {
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

    const document = fromPersisted(
      { id: attempt.exerciseId, moduleId: '', title: '', instructions: '', updatedAt: '' },
      defResult.value.exercise.content,
      defResult.value.exercise.expectedAnswers,
    );

    // `check.on` off means the author wanted no machine reading of this exercise at all.
    // A self-check would be exactly that, one item at a time.
    const budget = document.check.on ? document.flow.selfCheck : 0;
    const spend = attempt.useSelfCheck(budget);
    if (spend.isFail) {
      return Result.fail(spend.error as AttemptDomainError);
    }

    const items = document.items.filter((item) => item.wrong.trim() !== '');
    const feedback = selfCheckFeedback(
      { items, check: document.check, hints: document.hints },
      edits,
    );

    await this.attempts.save(attempt);

    return Result.ok<SelfCheckResult, SelfCheckError>({
      attemptId: attempt.id,
      checksUsed: attempt.selfChecksUsed,
      checksLeft: Math.max(0, budget - attempt.selfChecksUsed),
      items: feedback.items,
      fixedCount: feedback.fixedCount,
      spanCount: feedback.spanCount,
    });
  }
}

/**
 * The draft arrives in the shape a submission uses, because it is one — the same edits,
 * asked about early. Kept lenient about the edits themselves (`readEdits` coerces) and
 * strict about the envelope, where a bad shape is a client bug rather than a bad answer.
 */
function readSubmission(draft: unknown): Record<string, StudentEdits> | null {
  if (typeof draft !== 'object' || draft === null || Array.isArray(draft)) return null;

  const { items } = draft as { items?: unknown };
  if (typeof items !== 'object' || items === null || Array.isArray(items)) return null;

  const out: Record<string, StudentEdits> = {};
  for (const [itemId, raw] of Object.entries(items)) {
    out[itemId] = readEdits(raw);
  }
  return out;
}
