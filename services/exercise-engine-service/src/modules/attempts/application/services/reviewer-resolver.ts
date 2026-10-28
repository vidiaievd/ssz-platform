import { Inject, Injectable, Logger } from '@nestjs/common';
import type { RubricSnapshot } from '@ssz/shared-kernel/writing-task';
import {
  ENTITLEMENTS_CLIENT,
  type IEntitlementsClient,
  type Payer,
} from '../../../../shared/application/ports/entitlements-client.port.js';
import {
  hasVoiceCheck,
  reviewSubject,
} from '../../../ai-drafts/application/queries/get-review-subject/review-subject.js';

/** The feature key a self-study learner needs for a model to review their work (plan 78). */
export const REVIEW_DIRECT_FEATURE = 'ai.review_direct';

/** The voice check of a `read_aloud` reading — speech recognition against the passage (plan 82). */
export const VOICE_REVIEW_FEATURE = 'ai.voice_review';

/**
 * The same check with pronunciation scores beside it (Azure, plan 82 step 9). A plan may carry
 * it without the basic key, so either one means a machine will answer.
 */
export const VOICE_REVIEW_PRONUNCIATION_FEATURE = 'ai.voice_review_pronunciation';

/**
 * The keys any one of which lets a machine review the template — the voice check for a
 * recording, the direct review for text. Which level of the voice check runs is ai-service's
 * gate to read off the payer's plan; here only "will anyone answer" is asked.
 */
export function reviewFeatures(templateCode: string): readonly string[] {
  return hasVoiceCheck(templateCode)
    ? [VOICE_REVIEW_FEATURE, VOICE_REVIEW_PRONUNCIATION_FEATURE]
    : [REVIEW_DIRECT_FEATURE];
}

/**
 * Who will read a submission the validator could not decide (plan 79, step 2.1c).
 *
 * - `teacher` — it has a school, and the school's queue shows it.
 * - `ai` — no school, but a model may review it for the learner (part 2).
 * - `none` — neither. The attempt closes as `NO_REVIEWER`.
 */
export type Reviewer = 'teacher' | 'ai' | 'none';

export interface ReviewerQuestion {
  userId: string;
  schoolId: string | null;
  templateCode: string;
  targetLanguage: string;
  submittedAnswer: unknown;
  rubricSnapshot: RubricSnapshot | null;
  exercise: { content: unknown; expectedAnswers: unknown };
}

/**
 * Decides at submit whether anyone will answer — decision Q5-A: the engine asks, so the
 * learner hears the truth the moment they hand in, not after a wait that never ends.
 *
 * A model can review the work only if all three hold, cheapest first: the template has a
 * review prompt (read off the same `reviewSubject` ai-service is handed, so the two cannot
 * disagree — an old-form `short_answer` has none), the author left AI on for the exercise,
 * and the learner's plan includes `ai.review_direct`. A `read_aloud` reading (plan 82) is
 * checked by ear instead: `read` mode with the transcript check on, and `ai.voice_review` or
 * `ai.voice_review_pronunciation` on the plan.
 *
 * subscription-service not answering is read as `ai`, not as `none`: `NO_REVIEWER` is final,
 * and an outage must not cost a learner who pays the review they are owed. The attempt routes
 * as it did before this step, and ai-service's gate asks again before any model is called.
 */
@Injectable()
export class ReviewerResolver {
  private readonly logger = new Logger(ReviewerResolver.name);

  constructor(@Inject(ENTITLEMENTS_CLIENT) private readonly entitlements: IEntitlementsClient) {}

  async resolve(question: ReviewerQuestion): Promise<Reviewer> {
    if (question.schoolId !== null) return 'teacher';
    if (!modelCanReview(question, this.logger)) return 'none';

    const enabled = await anyEnabled(
      this.entitlements,
      { type: 'user', id: question.userId },
      reviewFeatures(question.templateCode),
    );
    if (enabled === null) {
      this.logger.warn(
        `Entitlements unknown for user ${question.userId}; routing for review as if a model may read it`,
      );
      return 'ai';
    }
    return enabled ? 'ai' : 'none';
  }
}

/**
 * Whether the payer has any of the keys, asked one at a time and stopping at the first that is
 * on. Null when a key that could have decided it could not be read — an unread key is never
 * taken for an off one.
 */
export async function anyEnabled(
  entitlements: IEntitlementsClient,
  payer: Payer,
  featureKeys: readonly string[],
): Promise<boolean | null> {
  let unknown = false;
  for (const key of featureKeys) {
    const enabled = await entitlements.isEnabled(payer, key);
    if (enabled.isFail) unknown = true;
    else if (enabled.value) return true;
  }
  return unknown ? null : false;
}

/**
 * Whether a model could review this work at all: the template has a review prompt (read off
 * the same `reviewSubject` ai-service is handed, so the two cannot disagree — an old-form
 * `short_answer` has none) and the author left AI on for the exercise. Shared by the
 * self-study reviewer and the school's policy (plan 80), which ask the same question.
 */
export function modelCanReview(
  question: Pick<ReviewerQuestion, 'templateCode' | 'submittedAnswer' | 'targetLanguage' | 'rubricSnapshot' | 'exercise'>,
  logger: Logger,
): boolean {
  try {
    const subject = reviewSubject(question.templateCode, question.exercise, {
      submittedAnswer: question.submittedAnswer,
      targetLanguage: question.targetLanguage,
      rubricSnapshot: question.rubricSnapshot,
    });
    return subject !== null && subject.ai.on;
  } catch (err) {
    // A document the template's reader cannot read is one no prompt can be built from.
    // The submission still closes — the learner's work is not refused for the author's bug.
    logger.warn(
      `No review subject for ${question.templateCode}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}
