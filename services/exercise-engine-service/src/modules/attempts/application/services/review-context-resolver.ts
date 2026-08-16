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
 * Where a submission would show up in review: the school and course the exercise
 * belongs to, the group the learner is in, and the path as it read at the time.
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
    let schoolId: string | null = null;
    let containerId: string | null = null;
    let exercisePath: ExercisePathSnapshot | null = null;

    const placementResult = await this.contentClient.getExercisePlacement(exerciseId);
    if (placementResult.isOk) {
      const placement = placementResult.value;
      schoolId = placement.ownerSchoolId;
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

    let groupId: string | null = null;
    if (schoolId) {
      const groupResult = await this.organizationClient.resolveStudentGroup(schoolId, userId);
      if (groupResult.isOk) {
        groupId = groupResult.value.groupId;
      } else {
        this.logger.warn(
          `Group resolution failed for user ${userId} in school ${schoolId}: ${groupResult.error.message}`,
        );
      }
    }

    return { schoolId, containerId, groupId, exercisePath };
  }
}
