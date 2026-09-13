import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CONTENT_CLIENT,
  type IContentClient,
} from '../../../../shared/application/ports/content-client.port.js';
import {
  ORGANIZATION_CLIENT,
  type IOrganizationClient,
} from '../../../../shared/application/ports/organization-client.port.js';
import type { ExercisePathSnapshot } from '../../domain/entities/attempt.entity.js';

export interface ReviewContext {
  schoolId: string | null;
  containerId: string | null;
  groupId: string | null;
  exercisePath: ExercisePathSnapshot | null;
}

/**
 * Where a submission would show up in review: the workspace the learner belongs to,
 * the course the exercise belongs to, the group the learner is in, and the path as it
 * read at the time.
 *
 * The workspace comes from the learner, not from the content (plan 59 §3, phase 3.2).
 * Taking it from the content's owner lost the school twice over: a school's learner
 * working through a borrowed or public course got `schoolId = null` and fell out of
 * every queue, and a private tutor's course owns no school at all, so their students'
 * work was unreachable in principle. The content's school still travels as a hint —
 * it breaks ties when the learner sits in more than one group, as does the course's
 * author — which is what tells a learner's tutor group from their school group.
 *
 * Every lookup is best-effort. Starting or handing in an exercise matters more than
 * knowing any of this, and a neighbour that doesn't answer only means the attempt
 * stays invisible to oversight — the "learner outside a group" row the spec already
 * describes (plan 44 §0.4), never a reason to fail the learner's request.
 *
 * Shared by start-attempt, which snapshots it, and submit-answer, which fills in
 * blanks on the way to review — one place, so the two cannot disagree.
 */
@Injectable()
export class ReviewContextResolver {
  private readonly logger = new Logger(ReviewContextResolver.name);

  constructor(
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
    @Inject(ORGANIZATION_CLIENT) private readonly organizationClient: IOrganizationClient,
  ) {}

  async resolve(userId: string, exerciseId: string): Promise<ReviewContext> {
    let containerId: string | null = null;
    let ownerSchoolId: string | null = null;
    let ownerUserId: string | null = null;
    let exercisePath: ExercisePathSnapshot | null = null;

    const placementResult = await this.contentClient.getExercisePlacement(exerciseId);
    if (placementResult.isOk) {
      const placement = placementResult.value;
      ownerSchoolId = placement.ownerSchoolId;
      ownerUserId = placement.ownerUserId;
      containerId = placement.containerId;
      exercisePath = {
        course: placement.containerTitle,
        module: placement.moduleTitle,
        exercise: placement.exerciseTitle,
      };
    } else {
      this.logger.warn(
        `Placement lookup failed for exercise ${exerciseId}: ${placementResult.error.message}`,
      );
    }

    let schoolId: string | null = null;
    let groupId: string | null = null;

    const contextResult = await this.organizationClient.resolveLearnerReviewContext(userId, {
      courseId: containerId,
      preferredSchoolId: ownerSchoolId,
      preferredTeacherId: ownerUserId,
    });
    if (contextResult.isOk) {
      schoolId = contextResult.value.schoolId;
      groupId = contextResult.value.groupId;
    } else {
      this.logger.warn(
        `Review context resolution failed for user ${userId}: ${contextResult.error.message}`,
      );
    }

    // Last resort, and only when the learner's own workspace is unknown: a learner
    // who is on no roster at all but is working through a school's course still belongs
    // in that school's oversight, exactly as before this became learner-led.
    return { schoolId: schoolId ?? ownerSchoolId, containerId, groupId, exercisePath };
  }
}
