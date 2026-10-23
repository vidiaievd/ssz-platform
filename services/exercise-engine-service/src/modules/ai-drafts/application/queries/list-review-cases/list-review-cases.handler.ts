import { Inject } from '@nestjs/common';
import type { RubricMarks } from '@ssz/shared-kernel/writing-task';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
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
import { decidedPerItem, hasReviewPrompt, reviewSubject, type ReviewSubject } from '../get-review-subject/review-subject.js';
import { ListReviewCasesQuery } from './list-review-cases.query.js';

/** One remark the model offered — where it pointed, not what it said. */
export interface OfferedRemark {
  sentenceIndex: number;
  itemId: string;
  aspect: string;
  /** Null for a remark about the text as a whole (writing_task `task` / `structure`). */
  fragment: string | null;
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
  subject: ReviewSubject;
  offered: { modelId: string | null; promptVersion: string | null; remarks: OfferedRemark[] };
  /** Remark by remark, in `offered.remarks` order. */
  outcomes: SettledOutcomes;
  /** The verdict per sentence: accepted as it stands or not. Empty for a rubric-marked essay. */
  decisions: Array<{ itemId: string; approved: boolean }>;
  /**
   * The marks the teacher gave an essay, by the criterion ids of `subject.rubric` — what a
   * candidate's suggested marks are measured against (step 1.7d), whether or not the draft
   * that was settled suggested any. Null for every other template.
   */
  marks: RubricMarks | null;
}

/** Why a decided draft is not in the set. */
export type ReviewCaseSkip =
  /** The attempt row is gone (deleted with its learner). */
  | 'ATTEMPT_GONE'
  /**
   * A template decided sentence by sentence whose verdict carries no decisions: nothing to
   * measure a draft against. A rubric-marked essay has none by design and is not skipped.
   */
  | 'NO_DECISIONS'
  /** No review prompt for this template yet (translate, error_correction and writing_task have one). */
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
      const code = attempt.templateCode;
      if (!hasReviewPrompt(code)) {
        skip('TEMPLATE_NOT_SUPPORTED');
        continue;
      }
      const decisions = attempt.reviewDecisions ?? [];
      if (decisions.length === 0 && decidedPerItem(code)) {
        skip('NO_DECISIONS');
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

      const subject = reviewSubject(code, exercise.value.exercise, attempt);
      if (subject === null) {
        skip('TEMPLATE_NOT_SUPPORTED');
        continue;
      }
      cases.push({
        caseId: attempt.id,
        decidedAt: draft.decidedAt.toISOString(),
        templateCode: code,
        subject,
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
        marks: subject.template === 'writing_task' ? (attempt.rubricMarks ?? null) : null,
      });
    }

    return Result.ok({ cases, skipped });
  }
}
