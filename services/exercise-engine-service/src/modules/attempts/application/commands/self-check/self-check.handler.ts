import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import {
  fromPersisted,
  readEdits,
  selfCheckFeedback,
  TEMPLATE_CODE,
} from '@ssz/shared-kernel/error-correction';
import type { SelfCheckItem, StudentEdits } from '@ssz/shared-kernel/error-correction';
import {
  fromPersisted as trFromPersisted,
  isTranslateCode,
  readSubmission as trReadSubmission,
  runItems as trRunItems,
  selfCheckFeedback as trSelfCheckFeedback,
} from '@ssz/shared-kernel/translate';
import type { SelfCheckItem as TrSelfCheckItem } from '@ssz/shared-kernel/translate';
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

/**
 * What one self-check reports, which is template-specific: error correction counts
 * mistakes reached, translate scores each sentence against the key it must not show.
 * The envelope — whose attempt, and how many checks are left — is common.
 */
export type SelfCheckPayload =
  | {
      templateCode: typeof TEMPLATE_CODE;
      items: SelfCheckItem[];
      fixedCount: number;
      spanCount: number;
    }
  | {
      templateCode: 'translate_to_target' | 'translate_from_target';
      items: TrSelfCheckItem[];
      /** Sentences a hit on the key would close on its own, as things stand. */
      passing: number;
    };

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

/** The budget for this exercise, and what the check has to say. */
interface Graded {
  budget: number;
  payload: SelfCheckPayload;
}

function gradeErrorCorrection(
  envelope: {
    id: string;
    moduleId: string;
    title: string;
    instructions: string;
    updatedAt: string;
  },
  content: unknown,
  expectedAnswers: unknown,
  edits: Record<string, StudentEdits>,
): Graded {
  const document = fromPersisted(envelope, content, expectedAnswers);
  const items = document.items.filter((item) => item.wrong.trim() !== '');
  const feedback = selfCheckFeedback(
    { items, check: document.check, hints: document.hints },
    edits,
  );

  return {
    // `check.on` off means the author wanted no machine reading of this exercise at all.
    // A self-check would be exactly that, one item at a time.
    budget: document.check.on ? document.flow.selfCheck : 0,
    payload: {
      templateCode: TEMPLATE_CODE,
      items: feedback.items,
      fixedCount: feedback.fixedCount,
      spanCount: feedback.spanCount,
    },
  };
}

function gradeTranslate(
  templateCode: 'translate_to_target' | 'translate_from_target',
  envelope: {
    id: string;
    moduleId: string;
    title: string;
    instructions: string;
    updatedAt: string;
  },
  content: unknown,
  expectedAnswers: unknown,
  answers: Record<string, string>,
): Graded {
  const document = trFromPersisted(envelope, templateCode, content, expectedAnswers);
  const items = trRunItems(document);
  const feedback = trSelfCheckFeedback(
    { items, check: document.check, flow: document.flow },
    answers,
  );

  return {
    budget: document.check.on ? document.flow.selfCheck : 0,
    payload: { templateCode, items: feedback.items, passing: feedback.passing },
  };
}

/**
 * The draft arrives in the shape a submission uses, because it is one — the same edits,
 * asked about early. Kept lenient about the edits themselves (`readEdits` coerces) and
 * strict about the envelope, where a bad shape is a client bug rather than a bad answer.
 */
function readEcDraft(draft: unknown): Record<string, StudentEdits> | null {
  if (typeof draft !== 'object' || draft === null || Array.isArray(draft)) return null;

  const { items } = draft as { items?: unknown };
  if (typeof items !== 'object' || items === null || Array.isArray(items)) return null;

  const out: Record<string, StudentEdits> = {};
  for (const [itemId, raw] of Object.entries(items)) {
    out[itemId] = readEdits(raw);
  }
  return out;
}

/** The same, for translate: the sentences typed so far, in the shape a submission uses. */
function readTrDraft(draft: unknown): Record<string, string> | null {
  const list = Array.isArray(draft)
    ? draft
    : typeof draft === 'object' && draft !== null
      ? (draft as { answers?: unknown }).answers
      : undefined;

  if (!Array.isArray(list)) return null;
  return trReadSubmission(list);
}
