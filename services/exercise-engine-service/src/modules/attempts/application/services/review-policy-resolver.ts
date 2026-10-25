import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  ENTITLEMENTS_CLIENT,
  type IEntitlementsClient,
} from '../../../../shared/application/ports/entitlements-client.port.js';
import {
  REVIEW_POLICY_READER,
  type IReviewPolicyReader,
  type SchoolReviewMode,
} from '../../../../shared/application/ports/review-policy-reader.port.js';
import type { AttemptReviewAiPolicy } from '../../domain/entities/attempt.entity.js';
import { modelCanReview, type ReviewerQuestion } from './reviewer-resolver.js';

/** The switch a school's plan needs before a mode with a model applies (plan 80, R7). */
export const SCHOOL_REVIEW_AI_POLICY_FEATURE = 'school.review_ai_policy';

/** A number in [0, 1) — the sampling draw; a token so tests can fix it. */
export const REVIEW_SAMPLE_RANDOM = Symbol('REVIEW_SAMPLE_RANDOM');

export interface ReviewPolicyQuestion extends ReviewerQuestion {
  schoolId: string;
  /** The course the work belongs to; its terms apply only if the school owns it. */
  containerId: string | null;
  submittedAt: Date;
}

interface Terms {
  mode: SchoolReviewMode;
  autoAcceptAfterHours: number | null;
  samplePercent: number;
  teacherReviewTemplates: string[];
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * The school's review policy for one piece of work, at hand-in (plan 80, step 3a).
 *
 * A mode with a model applies only if everything holds, cheapest first: a model can read the
 * work at all (the same test as for a learner without a school), the school chose such a
 * mode, and the school's plan has `school.review_ai_policy` — checked here, not trusted from
 * the saved mode, because a plan can lapse after the mode was saved (R7).
 *
 * Every doubt reads as "a teacher reviews it": no policy, a neighbour down, the plan
 * unreadable. That is the platform's behaviour before this plan, and it costs nobody
 * anything — the work waits for the teacher it would have waited for anyway.
 *
 * The course's terms (its own term, its "always to a teacher" templates) apply only to work
 * handed in at the school that owns the course. A course another school shares is under the
 * learner's school's terms, which is the school whose teachers answer and who pays.
 */
@Injectable()
export class ReviewPolicyResolver {
  private readonly logger = new Logger(ReviewPolicyResolver.name);

  constructor(
    @Inject(REVIEW_POLICY_READER) private readonly policies: IReviewPolicyReader,
    @Inject(ENTITLEMENTS_CLIENT) private readonly entitlements: IEntitlementsClient,
    @Optional() @Inject(REVIEW_SAMPLE_RANDOM) private readonly random: () => number = Math.random,
  ) {}

  async resolve(question: ReviewPolicyQuestion): Promise<AttemptReviewAiPolicy | null> {
    if (!modelCanReview(question, this.logger)) return null;

    const terms = await this.termsOf(question.schoolId, question.containerId);
    if (terms === null || terms.mode === 'teacher_only') return null;

    const enabled = await this.entitlements.isEnabled(
      { type: 'workspace', id: question.schoolId },
      SCHOOL_REVIEW_AI_POLICY_FEATURE,
    );
    if (enabled.isFail) {
      this.logger.warn(
        `Entitlements unknown for school ${question.schoolId}; its work goes to a teacher only`,
      );
      return null;
    }
    if (!enabled.value) return null;

    return {
      mode: terms.mode,
      autoAcceptAt:
        terms.autoAcceptAfterHours === null
          ? null
          : new Date(question.submittedAt.getTime() + terms.autoAcceptAfterHours * HOUR_MS),
      teacherDrawn:
        terms.mode === 'ai_with_sampling' &&
        (terms.teacherReviewTemplates.includes(question.templateCode) ||
          this.random() * 100 < terms.samplePercent),
    };
  }

  /**
   * The course's read when the school owns the course and content-service could see the
   * school behind it; otherwise the school's own — keeping the course's template list if
   * the course is the school's.
   */
  private async termsOf(schoolId: string, courseId: string | null): Promise<Terms | null> {
    try {
      const course = courseId === null ? null : await this.policies.courseReviewPolicy(courseId);
      const owned = course !== null && course.ownerSchoolId === schoolId;
      if (owned && course.schoolMode !== null) {
        return {
          mode: course.schoolMode,
          autoAcceptAfterHours: course.autoAcceptAfterHours,
          samplePercent: course.samplePercent ?? 0,
          teacherReviewTemplates: course.teacherReviewTemplates,
        };
      }

      const school = await this.policies.schoolReviewPolicy(schoolId);
      if (school === null) return null;
      return {
        mode: school.mode,
        autoAcceptAfterHours: school.autoAcceptAfterHours,
        samplePercent: school.samplePercent,
        teacherReviewTemplates: owned ? course.teacherReviewTemplates : [],
      };
    } catch (err) {
      this.logger.warn(
        `Review policy of school ${schoolId} unreadable; its work goes to a teacher only: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }
}
