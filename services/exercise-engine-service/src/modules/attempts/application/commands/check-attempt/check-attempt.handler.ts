import { Inject, Logger, Optional } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { AiFeedback } from '@ssz/contracts';
import { TEMPLATE_CODE as ERROR_CORRECTION } from '@ssz/shared-kernel/error-correction';
import {
  accuracyPercent,
  checkReading,
  freshPart as raFreshPart,
  fromPersisted as raFromPersisted,
  readingPasses,
  TEMPLATE_CODE as READ_ALOUD,
  withCarried as raWithCarried,
  type ReadingCheck,
} from '@ssz/shared-kernel/read-aloud';
import { TEMPLATE_CODE as SHORT_ANSWER } from '@ssz/shared-kernel/short-answer';
import { isTranslateCode } from '@ssz/shared-kernel/translate';
import type { StudentEdits } from '@ssz/shared-kernel/error-correction';
import { CheckAttemptCommand } from './check-attempt.command.js';
import type { Attempt } from '../../../domain/entities/attempt.entity.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../domain/repositories/attempt.repository.js';
import type { AttemptDomainError } from '../../../domain/exceptions/attempt.errors.js';
import {
  CONTENT_CLIENT,
  type IContentClient,
  ContentClientError,
} from '../../../../../shared/application/ports/content-client.port.js';
import {
  ENTITLEMENT_LIMITS_CLIENT,
  type IEntitlementLimitsClient,
} from '../../../../../shared/application/ports/entitlements-client.port.js';
import {
  PRECHECK_SETTINGS_READER,
  type IPrecheckSettingsReader,
} from '../../../../../shared/application/ports/precheck-settings-reader.port.js';
import {
  AI_PRECHECK_CLIENT,
  type AiPrecheckRefusal,
  type IAiPrecheckClient,
  type PrecheckLimits,
  type PrecheckRemaining,
} from '../../../../../shared/application/ports/ai-precheck-client.port.js';
import { MEDIA_ASSETS, type IMediaAssets } from '../../../../../shared/application/ports/media-assets.port.js';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.port.js';
import { ValidationError } from '../../../../../shared/application/ports/answer-validator.port.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { reviewSubject } from '../../../../ai-drafts/application/queries/get-review-subject/review-subject.js';
import type { ReadAloudSubject } from '../../../../ai-drafts/application/queries/get-review-subject/read-aloud-subject.js';
import { precheckCapability } from '../../services/precheck-capability.js';
import { atomsFlagged, publishAtomsFlagged } from '../../services/flagged-atoms.js';
import {
  gradeErrorCorrection,
  gradeTranslate,
  keySettles,
  readEcDraft,
  readTrDraft,
  type SelfCheckPayload,
} from '../../services/self-check-grading.js';
import {
  assetIdsOf,
  carriedInto,
  checkAssets,
  readRecordings,
  type RecordingRefusal,
} from '../../services/read-aloud-recordings.js';

/** The plan key a school needs before its learners may rehearse with a model (plan 78 catalogue). */
export const AI_PRACTICE_FEATURE = 'ai.practice';

/** The plan's name for the monthly ceiling per learner on that key. */
const PLAN_LEARNER_LIMIT = 'perLearnerMonthlyCredits';

export type CheckAttemptError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  | { code: 'FORBIDDEN' }
  /** Not a template "check" exists for (Q3). */
  | { code: 'UNSUPPORTED_TEMPLATE' }
  /** Handed in, returned or abandoned: after hand-in nothing is checked (§3, rule 3). */
  | { code: 'NOT_IN_PROGRESS' }
  | { code: 'SCHEMA_MISMATCH' }
  /** No deterministic check, and no model the school lets its learners ask. */
  | { code: 'PRECHECK_NOT_AVAILABLE'; reason: AccessRefusal }
  /** The same, because the school's setting or plan could not be read: worth a retry. */
  | { code: 'PRECHECK_ACCESS_UNKNOWN' }
  | { code: 'MEDIA_UNAVAILABLE' }
  | RecordingRefusal
  | ContentClientError
  | AttemptDomainError;

/** Why the engine itself asked no model. */
export type CheckNotAsked =
  /** The key alone settles the draft: every mistake corrected, every sentence accepted. */
  | 'key_settles'
  | AccessRefusal
  /** An old-form `short_answer`, which has no key points to read an answer by. */
  | 'template_not_supported';

type AccessRefusal =
  /** No school behind the attempt: the rehearsal is a school's (plan 84). */
  | 'no_school'
  /** The school has not switched it on (organization-service `ai-precheck`). */
  | 'disabled'
  /** The school's plan has no `ai.practice`. */
  | 'not_entitled'
  /** The setting or the plan could not be read. */
  | 'access_unknown';

/** What became of the model's half of the check. */
export type CheckAiOutcome =
  | { status: 'ok' }
  | { status: 'refused'; reason: AiPrecheckRefusal; detail: string | null }
  /** `ai_unavailable` when ai-service itself did not answer. */
  | { status: 'failed'; errorCode: string }
  | { status: 'not_asked'; reason: CheckNotAsked };

/** The deterministic half, as `self-check` reports it. */
export type CheckSelfCheck = { checksUsed: number; checksLeft: number } & SelfCheckPayload;

/** One passage of a reading, checked against what the speech model heard. */
export interface PrecheckPromptReading {
  itemId: string;
  /** Whole percent of the passage's words read, rounded down. */
  percent: number;
  /** The share reaches the author's mark — what the hand-in would be measured by. */
  passed: boolean;
  /** Word by word, in passage order: read, misread, missed, extra. */
  check: ReadingCheck;
}

export interface PrecheckReading {
  passPercent: number;
  prompts: PrecheckPromptReading[];
  /** Carried from a returned try: ruled then, not heard now. */
  carriedItemIds: string[];
}

export interface CheckAttemptResult {
  attemptId: string;
  templateCode: string;
  /** The course the attempt belongs to — what «add the rule to review» needs (plan 85, step 7). */
  courseId: string | null;
  /** Null when the template has none, or the author's self-checks are spent. */
  selfCheck: CheckSelfCheck | null;
  ai: CheckAiOutcome;
  /** The model's remarks (text) or the words heard (reading); null unless `ai.status` is `ok`. */
  feedback: AiFeedback | null;
  /** `read_aloud` with `ai.status` `ok`: which passage words the reading reached. */
  reading: PrecheckReading | null;
  /** What the school's limits leave; null when no model was asked or the limits were not read. */
  remaining: PrecheckRemaining | null;
}

type Access = { limits: PrecheckLimits } | { refusal: AccessRefusal };

/**
 * "Check" before hand-in (plan 84, step 5): one button for every template that has any check
 * before the work is handed in.
 *
 * The free check comes first. Where the template has a deterministic reading against the key
 * (`error_correction`, `translate_*`) it runs as `self-check` does, on the author's budget,
 * and when the key alone settles the draft no model is asked. Otherwise, and for the templates
 * only a model can read before hand-in (`writing_task`, `short_answer`, `read_aloud` in `read`
 * mode), ai-service rehearses the draft with the school as payer — if the school switched it
 * on and its plan has `ai.practice` — within the school's limits, the monthly one lowered to
 * the plan's.
 *
 * Nothing that counts moves (§3, rules 1–2): the attempt stays in progress, no card is rated,
 * and nothing about the attempt is published. The one write is the self-check budget on the
 * attempt; the model's calls are counted in ai-service's ledger by (learner, exercise), so a new
 * attempt does not reset them. The one letter is `exercise.feedback.atoms_flagged` (plan 85,
 * step 4), when the model's remarks named rule atoms: a mistake on a rule, never a verdict.
 *
 * A `read_aloud` take is checked as a hand-in checks it — this learner's, made for this attempt,
 * uploaded — before its id goes anywhere: ai-service plays whatever id it is given, and the
 * transcript of someone else's recording is theirs, not this learner's.
 */
@CommandHandler(CheckAttemptCommand)
export class CheckAttemptHandler implements ICommandHandler<CheckAttemptCommand> {
  private readonly logger = new Logger(CheckAttemptHandler.name);

  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
    @Inject(PRECHECK_SETTINGS_READER) private readonly settings: IPrecheckSettingsReader,
    @Inject(ENTITLEMENT_LIMITS_CLIENT) private readonly entitlements: IEntitlementLimitsClient,
    @Inject(AI_PRECHECK_CLIENT) private readonly ai: IAiPrecheckClient,
    @Inject(EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
    @Optional() @Inject(MEDIA_ASSETS) private readonly media: IMediaAssets | null = null,
  ) {}

  async execute(command: CheckAttemptCommand): Promise<Result<CheckAttemptResult, CheckAttemptError>> {
    const attempt = await this.attempts.findById(command.attemptId);
    if (!attempt) return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });
    if (attempt.userId !== command.userId) return Result.fail({ code: 'FORBIDDEN' });

    const capability = precheckCapability(attempt.templateCode);
    if (capability === null) return Result.fail({ code: 'UNSUPPORTED_TEMPLATE' });
    if (attempt.status !== 'IN_PROGRESS') return Result.fail({ code: 'NOT_IN_PROGRESS' });

    // A malformed draft is a client bug: it costs neither a read of the key nor a check.
    if (!draftReadable(attempt.templateCode, command.draftAnswer)) return Result.fail({ code: 'SCHEMA_MISMATCH' });

    const access: Access = capability.ai ? await this.accessOf(attempt) : { refusal: 'disabled' };
    if (!capability.selfCheck && 'refusal' in access) {
      return Result.fail(
        access.refusal === 'access_unknown'
          ? { code: 'PRECHECK_ACCESS_UNKNOWN' }
          : { code: 'PRECHECK_NOT_AVAILABLE', reason: access.refusal },
      );
    }

    // PRACTICE rather than the attempt's own mode: both halves read the key server-side,
    // whatever the attempt ships to the client, and nothing of it goes back.
    const definition = await this.contentClient.getExerciseForAttempt(
      attempt.exerciseId,
      attempt.targetLanguage,
      'PRACTICE',
    );
    if (definition.isFail) return Result.fail(definition.error);
    const exercise = definition.value.exercise;

    const base = { attemptId: attempt.id, templateCode: attempt.templateCode, courseId: attempt.containerId };
    let selfCheck: CheckSelfCheck | null = null;
    let spendRefused: AttemptDomainError | null = null;
    if (capability.selfCheck) {
      const graded = this.grade(attempt, exercise, command.draftAnswer);
      const spend = attempt.useSelfCheck(graded.budget);
      if (spend.isOk) {
        await this.attempts.save(attempt);
        selfCheck = {
          checksUsed: attempt.selfChecksUsed,
          checksLeft: Math.max(0, graded.budget - attempt.selfChecksUsed),
          ...graded.payload,
        };
        if (keySettles(graded.payload)) return Result.ok(answered(base, selfCheck, { status: 'not_asked', reason: 'key_settles' }));
      } else {
        spendRefused = spend.error as AttemptDomainError;
      }
    }

    // With nothing at all to say, the self-check's own refusal is the answer, as before.
    const notAsked = (reason: CheckNotAsked): Result<CheckAttemptResult, CheckAttemptError> =>
      selfCheck === null && spendRefused !== null
        ? Result.fail(spendRefused)
        : Result.ok(answered(base, selfCheck, { status: 'not_asked', reason }));
    if ('refusal' in access) return notAsked(access.refusal);

    const submitted = await this.submittedForSubject(attempt, exercise, command.draftAnswer);
    if ('code' in submitted || submitted instanceof ValidationError) return Result.fail(submitted);

    const subject = reviewSubject(attempt.templateCode, exercise, {
      submittedAnswer: submitted.draft,
      targetLanguage: attempt.targetLanguage,
      // The rubric is frozen at hand-in, and a rehearsal suggests no marks by it.
      rubricSnapshot: null,
    });
    if (subject === null) return notAsked('template_not_supported');

    const asked = await this.ai.precheck({
      schoolId: attempt.schoolId!,
      userId: attempt.userId,
      exerciseId: attempt.exerciseId,
      attemptId: attempt.id,
      courseId: attempt.containerId,
      subject,
      limits: access.limits,
    });
    if (asked.isFail) {
      return Result.ok(answered(base, selfCheck, { status: 'failed', errorCode: 'ai_unavailable' }));
    }

    const outcome = asked.value;
    if (outcome.status === 'refused') {
      return Result.ok(
        answered(base, selfCheck, { status: 'refused', reason: outcome.reason, detail: outcome.detail }, outcome.remaining),
      );
    }
    if (outcome.status === 'failed') {
      return Result.ok(answered(base, selfCheck, { status: 'failed', errorCode: outcome.errorCode }, outcome.remaining));
    }
    await publishAtomsFlagged(
      this.publisher,
      this.logger,
      atomsFlagged(attempt, 'ai_precheck', (outcome.feedback.items ?? []).map((item) => item.atomRef), new Date()),
    );
    return Result.ok({
      ...answered(base, selfCheck, { status: 'ok' }, outcome.remaining),
      feedback: outcome.feedback,
      reading: subject.template === 'read_aloud' ? readingOf(subject, outcome.feedback) : null,
    });
  }

  /**
   * Whether the school lets this learner ask a model, and within what. The school's monthly
   * limit is lowered to its plan's (`perLearnerMonthlyCredits` of `ai.practice`) — the school
   * can only narrow the plan's. ai-service's gate still checks the plan and the pool itself.
   */
  private async accessOf(attempt: Attempt): Promise<Access> {
    if (attempt.schoolId === null) return { refusal: 'no_school' };

    let settings;
    try {
      settings = await this.settings.schoolAiPrecheck(attempt.schoolId);
    } catch (err) {
      this.logger.warn(
        `ai-precheck of school ${attempt.schoolId} unreadable: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { refusal: 'access_unknown' };
    }
    if (settings === null || !settings.enabled) return { refusal: 'disabled' };

    const feature = await this.entitlements.feature({ type: 'workspace', id: attempt.schoolId }, AI_PRACTICE_FEATURE);
    if (feature.isFail) return { refusal: 'access_unknown' };
    if (!feature.value.enabled) return { refusal: 'not_entitled' };

    return {
      limits: {
        perExercise: settings.perExerciseLimit,
        perLearnerMonthlyCredits: lowerOf(settings.perLearnerMonthlyCredits, feature.value.limits[PLAN_LEARNER_LIMIT] ?? null),
      },
    };
  }

  private grade(
    attempt: Attempt,
    exercise: { content: unknown; expectedAnswers: unknown },
    draftAnswer: unknown,
  ): { budget: number; payload: SelfCheckPayload } {
    const envelope = { id: attempt.exerciseId, moduleId: '', title: '', instructions: '', updatedAt: '' };
    const templateCode = attempt.templateCode;
    // `draftReadable` has already admitted the draft, so neither reader answers null here.
    return isTranslateCode(templateCode)
      ? gradeTranslate(templateCode, envelope, exercise.content, exercise.expectedAnswers, readTrDraft(draftAnswer)!)
      : gradeErrorCorrection(
          envelope,
          exercise.content,
          exercise.expectedAnswers,
          readEcDraft(draftAnswer) as Record<string, StudentEdits>,
        );
  }

  /**
   * The draft as the subject should read it.
   *
   * A reading: the prompts carried from a returned try are put back as a hand-in would put
   * them, and every take recorded now is checked with media-service first. The prompts not
   * recorded yet are simply not heard — a reading may be rehearsed a passage at a time.
   *
   * A `short_answer`: the questions already answered are dropped. Each was handed in on its
   * own with its verdict (rule 3), so only the ones still open are rehearsed.
   */
  private async submittedForSubject(
    attempt: Attempt,
    exercise: { content: unknown; expectedAnswers: unknown },
    draftAnswer: unknown,
  ): Promise<{ draft: unknown } | RecordingRefusal | ValidationError | { code: 'MEDIA_UNAVAILABLE' }> {
    if (attempt.templateCode === SHORT_ANSWER) {
      return { draft: unansweredOnly(draftAnswer, new Set(attempt.answeredQuestions.map((a) => a.questionId))) };
    }
    if (attempt.templateCode !== READ_ALOUD) return { draft: draftAnswer };

    const submission = readRecordings(draftAnswer);
    if (submission instanceof ValidationError) return submission;

    const previous = attempt.previousAttemptId === null ? null : await this.attempts.findById(attempt.previousAttemptId);
    const carried = carriedInto(previous, exercise.content);
    const fresh = raFreshPart(submission, carried);
    const whole = raWithCarried(
      fresh,
      carried,
      raFromPersisted(exercise.content, exercise.expectedAnswers).prompts.map((p) => p.id),
    );
    if (fresh.recordings.length === 0) return { draft: whole };

    if (this.media === null) return { code: 'MEDIA_UNAVAILABLE' };
    const described = await this.media.describe(assetIdsOf(fresh));
    if (described.isFail) return { code: 'MEDIA_UNAVAILABLE' };
    const refused = checkAssets(fresh, exercise.content, exercise.expectedAnswers, described.value, {
      id: attempt.id,
      userId: attempt.userId,
    });
    return refused ?? { draft: whole };
  }
}

function answered(
  base: { attemptId: string; templateCode: string; courseId: string | null },
  selfCheck: CheckSelfCheck | null,
  ai: CheckAiOutcome,
  remaining: PrecheckRemaining | null = null,
): CheckAttemptResult {
  return { ...base, selfCheck, ai, feedback: null, reading: null, remaining };
}

/** The lower of two ceilings, null standing for "none from this side". */
function lowerOf(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

/**
 * The draft in the shape its template's submission has — strict about the envelope only, as
 * `self-check` is: the subject builders are lenient about everything inside it.
 */
function draftReadable(templateCode: string, draft: unknown): boolean {
  if (templateCode === ERROR_CORRECTION) return readEcDraft(draft) !== null;
  if (isTranslateCode(templateCode)) return readTrDraft(draft) !== null;
  if (templateCode === READ_ALOUD) return !(readRecordings(draft) instanceof ValidationError);
  if (templateCode === SHORT_ANSWER) {
    return Array.isArray(draft) || (isObject(draft) && Array.isArray((draft as { answers?: unknown }).answers));
  }
  return isObject(draft);
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `[{ questionId, text }]`, bare or under `answers`, less the questions already handed in. */
function unansweredOnly(draft: unknown, answered: ReadonlySet<string>): unknown {
  const list = Array.isArray(draft) ? draft : (draft as { answers?: unknown[] }).answers ?? [];
  return {
    answers: list.filter(
      (raw) => !(isObject(raw) && answered.has((raw as { questionId?: unknown }).questionId as string)),
    ),
  };
}

/**
 * What the reading reached, passage by passage: the kernel's check — the one a hand-in's
 * verdict stands on — over the words ai-service heard, joined in order.
 */
function readingOf(subject: ReadAloudSubject, feedback: AiFeedback): PrecheckReading {
  const words = feedback.words ?? [];
  return {
    passPercent: subject.passPercent,
    prompts: subject.prompts.map((prompt, index) => {
      const heard = words
        .filter((w) => w.passageIndex === index)
        .map((w) => w.text)
        .join(' ');
      const check = checkReading(prompt.text, heard, subject.targetLanguage, prompt.focus.map((word) => ({ word })));
      return {
        itemId: prompt.itemId,
        percent: accuracyPercent(check),
        passed: readingPasses(check, subject.passPercent),
        check,
      };
    }),
    carriedItemIds: subject.carriedItemIds,
  };
}
