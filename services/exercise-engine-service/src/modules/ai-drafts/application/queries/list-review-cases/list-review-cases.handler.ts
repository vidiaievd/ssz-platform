import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { isTranslateCode } from '@ssz/shared-kernel/translate';
import {
  CONTENT_CLIENT,
  type IContentClient,
} from '../../../../../shared/application/ports/content-client.port.js';
import { Result } from '../../../../../shared/kernel/result.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../../attempts/domain/repositories/attempt.repository.js';
import type { SettledOutcomes } from '../../../domain/draft-outcomes.js';
import {
  ATTEMPT_AI_DRAFT_REPOSITORY,
  type IAttemptAiDraftRepository,
} from '../../../domain/repositories/attempt-ai-draft.repository.js';
import { translateSubject, type TranslateSubject } from '../get-review-subject/translate-subject.js';
import { ListReviewCasesQuery } from './list-review-cases.query.js';

/** One remark the model offered — where it pointed, not what it said. */
export interface OfferedRemark {
  sentenceIndex: number;
  itemId: string;
  aspect: string;
  fragment: string;
}

/**
 * One decided draft as labelled data: the submission beside its key, what the model offered
 * and what the teacher made of it. No person in it — no learner, teacher or school id, and
 * none of the teacher's own words; `caseId` is the attempt, for whoever has to look one up.
 */
export interface ReviewCase {
  caseId: string;
  decidedAt: string;
  templateCode: string;
  subject: TranslateSubject;
  offered: { modelId: string | null; promptVersion: string | null; remarks: OfferedRemark[] };
  /** Remark by remark, in `offered.remarks` order. */
  outcomes: SettledOutcomes;
  /** The verdict per sentence: accepted as it stands or not. */
  decisions: Array<{ itemId: string; approved: boolean }>;
}

/** Why a decided draft is not in the set. */
export type ReviewCaseSkip =
  /** The attempt row is gone (deleted with its learner). */
  | 'ATTEMPT_GONE'
  /** The verdict carries no per-sentence decisions: nothing to measure a draft against. */
  | 'NO_DECISIONS'
  /** No review prompt for this template yet (plan 79, step 1.7). */
  | 'TEMPLATE_NOT_SUPPORTED'
  /** The exercise was deleted: there is no key to review against. */
  | 'EXERCISE_GONE';

export interface ReviewCasesResult {
  cases: ReviewCase[];
  /** Decided drafts left out, by reason; zero counts are omitted. */
  skipped: Partial<Record<ReviewCaseSkip, number>>;
}

export type ListReviewCasesError = { code: 'CONTENT_UNAVAILABLE' };

/**
 * Teachers' settled drafts as the set a candidate model is compared on (plan 79, step 1.6):
 * ai-service reruns each submission on the candidate and scores its remarks against what the
 * teacher kept and threw out.
 *
 * The key is read as it is today, not as it was when the draft was made — the set measures
 * a model against the exercise a learner would now get. An exercise read is shared by every
 * case of the same exercise and language.
 */
@QueryHandler(ListReviewCasesQuery)
export class ListReviewCasesHandler implements IQueryHandler<ListReviewCasesQuery> {
  constructor(
    @Inject(ATTEMPT_AI_DRAFT_REPOSITORY) private readonly drafts: IAttemptAiDraftRepository,
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(CONTENT_CLIENT) private readonly content: IContentClient,
  ) {}

  async execute(query: ListReviewCasesQuery): Promise<Result<ReviewCasesResult, ListReviewCasesError>> {
    const decided = await this.drafts.listDecided(query.capability, query.limit);
    const cases: ReviewCase[] = [];
    const skipped: ReviewCasesResult['skipped'] = {};
    const skip = (reason: ReviewCaseSkip) => {
      skipped[reason] = (skipped[reason] ?? 0) + 1;
    };
    const exercises = new Map<string, Promise<Awaited<ReturnType<IContentClient['getExerciseForAttempt']>>>>();

    for (const draft of decided) {
      if (!draft.outcomes || !draft.decidedAt) continue;
      const attempt = await this.attempts.findById(draft.attemptId);
      if (!attempt) {
        skip('ATTEMPT_GONE');
        continue;
      }
      const decisions = attempt.reviewDecisions ?? [];
      if (decisions.length === 0) {
        skip('NO_DECISIONS');
        continue;
      }
      const code = attempt.templateCode;
      if (!isTranslateCode(code)) {
        skip('TEMPLATE_NOT_SUPPORTED');
        continue;
      }

      const key = `${attempt.exerciseId}:${attempt.targetLanguage}`;
      if (!exercises.has(key)) {
        exercises.set(key, this.content.getExerciseForAttempt(attempt.exerciseId, attempt.targetLanguage, 'PRACTICE'));
      }
      const exercise = await exercises.get(key)!;
      if (exercise.isFail) {
        if (exercise.error.statusCode === 404) {
          skip('EXERCISE_GONE');
          continue;
        }
        return Result.fail({ code: 'CONTENT_UNAVAILABLE' });
      }

      const { content, expectedAnswers } = exercise.value.exercise;
      cases.push({
        caseId: attempt.id,
        decidedAt: draft.decidedAt.toISOString(),
        templateCode: code,
        subject: translateSubject(code, content, expectedAnswers, attempt.submittedAnswer),
        offered: {
          modelId: draft.modelId,
          promptVersion: draft.promptVersion,
          remarks: draft.items.map((r) => ({
            sentenceIndex: r.sentenceIndex,
            itemId: r.itemId,
            aspect: r.aspect,
            fragment: r.fragment,
          })),
        },
        outcomes: draft.outcomes,
        decisions: decisions.map((d) => ({ itemId: d.itemId, approved: d.approved })),
      });
    }

    return Result.ok({ cases, skipped });
  }
}
