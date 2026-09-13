import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ENROLLMENT_REPOSITORY, type IEnrollmentRepository } from '../../domain/repositories/enrollment.repository.interface.js';
import { CONTENT_CLIENT, type IContentClient } from '../../../../shared/application/ports/content-client.port.js';
import { ORGANIZATION_CLIENT, type IOrganizationClient } from '../../../../shared/application/ports/organization-client.port.js';
import { LEARNING_EVENT_PUBLISHER, type IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import { Enrollment } from '../../domain/entities/enrollment.entity.js';
import { Result } from '../../../../shared/kernel/result.js';
import { toEnrollmentDto, type EnrollmentDto } from '../dto/enrollment.dto.js';
import {
  EnrollmentAlreadyExistsError,
  AccessDeniedForContainerError,
  ContentServiceUnavailableError,
  OrganizationServiceUnavailableError,
  type EnrollmentApplicationError,
} from '../errors/enrollment-application.errors.js';
import { EnrollInContainerCommand } from './enroll-in-container.command.js';

@CommandHandler(EnrollInContainerCommand)
export class EnrollInContainerHandler
  implements ICommandHandler<EnrollInContainerCommand, Result<EnrollmentDto, EnrollmentApplicationError>>
{
  private readonly logger = new Logger(EnrollInContainerHandler.name);

  constructor(
    @Inject(ENROLLMENT_REPOSITORY) private readonly repo: IEnrollmentRepository,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
    @Inject(ORGANIZATION_CLIENT) private readonly orgClient: IOrganizationClient,
    @Inject(LEARNING_EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(cmd: EnrollInContainerCommand): Promise<Result<EnrollmentDto, EnrollmentApplicationError>> {
    // A learner who already holds this course is told so; one who left it is let back in
    // on the row they left behind. Building a second aggregate for them used to break the
    // `(userId, containerId)` unique index and surface as a 500 — an ordinary act
    // answered with an incident.
    const existing = await this.repo.findByUserAndContainer(cmd.userId, cmd.containerId);
    if (existing && existing.status !== 'UNENROLLED') {
      return Result.fail(new EnrollmentAlreadyExistsError(cmd.containerId));
    }

    const tierResult = await this.contentClient.getAccessTier(cmd.containerId);
    if (tierResult.isFail) {
      return Result.fail(new ContentServiceUnavailableError(tierResult.error.message));
    }

    const tier = tierResult.value;

    if (tier === 'ASSIGNED_ONLY') {
      return Result.fail(new AccessDeniedForContainerError(tier));
    }

    if (tier === 'FREE_WITHIN_SCHOOL') {
      if (!cmd.schoolId) {
        return Result.fail(new AccessDeniedForContainerError('FREE_WITHIN_SCHOOL requires school membership'));
      }
      const roleResult = await this.orgClient.getMemberRole(cmd.schoolId, cmd.userId);
      if (roleResult.isFail) {
        return Result.fail(new OrganizationServiceUnavailableError(roleResult.error.message));
      }
      if (!roleResult.value) {
        return Result.fail(new AccessDeniedForContainerError('User is not a member of the school'));
      }
    }

    if (tier === 'PUBLIC_PAID' || tier === 'ENTITLEMENT_REQUIRED') {
      return Result.fail(new AccessDeniedForContainerError(tier));
    }

    // Which workspace this enrolment belongs to. The caller names one only when the
    // learner reached the course through a school's shelf; on a private tutor's course
    // nobody names anything, and the row used to be stored with `schoolId: null` — the
    // tutor's dashboard then counted zero students of a course they teach themselves.
    // Attribution is not access: it is resolved after the tier checks above, so what a
    // learner may enrol in is still decided by the workspace the caller stated.
    const schoolId = cmd.schoolId ?? (await this.resolveWorkspace(cmd.userId, cmd.containerId));

    let enrollment: Enrollment;
    if (existing) {
      const revived = existing.reenrol(this.clock.now(), schoolId);
      if (revived.isFail) {
        return Result.fail(new EnrollmentAlreadyExistsError(cmd.containerId));
      }
      enrollment = existing;
    } else {
      enrollment = Enrollment.create(
        { userId: cmd.userId, containerId: cmd.containerId, schoolId },
        this.clock.now(),
      );
    }

    await this.repo.save(enrollment);

    for (const event of enrollment.getDomainEvents()) {
      await this.publisher.publish(
        (event as { eventType: string }).eventType,
        (event as any).payload,
      );
    }
    enrollment.clearDomainEvents();

    this.logger.log(
      `${existing ? 'Re-enrolled' : 'Enrolled'} user ${cmd.userId} in container ${cmd.containerId}`,
    );
    return Result.ok(toEnrollmentDto(enrollment));
  }

  /**
   * The learner's own workspace, asked of the service that owns rosters.
   *
   * Same rule the review queue learned in phase 3: the workspace comes from the learner,
   * with the course and its author as tie-breaks for someone who studies both at a school
   * and with a private tutor — without the author hint their tutor's homework is filed
   * under the school (plan 59 §3.2).
   *
   * Neither neighbour being reachable loses the attribution, not the enrolment: a learner
   * pressing "Enrol" should not be told the platform is broken because a dashboard would
   * miss a number.
   */
  private async resolveWorkspace(userId: string, containerId: string): Promise<string | null> {
    const owner = await this.contentClient.getContainerOwner(containerId);
    if (owner.isFail) {
      this.logger.warn(
        `Enrolment of ${userId} in ${containerId} stored without a workspace: ${owner.error.message}`,
      );
      return null;
    }

    const context = await this.orgClient.getLearnerWorkspace(userId, {
      courseId: containerId,
      preferredSchoolId: owner.value.ownerSchoolId,
      preferredTeacherId: owner.value.ownerUserId,
    });
    if (context.isFail) {
      this.logger.warn(
        `Enrolment of ${userId} in ${containerId} stored without a workspace: ${context.error.message}`,
      );
      return null;
    }

    return context.value.schoolId;
  }
}
