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
    const existing = await this.repo.findByUserAndContainer(cmd.userId, cmd.containerId);
    if (existing && existing.status === 'ACTIVE') {
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

    const enrollment = Enrollment.create(
      { userId: cmd.userId, containerId: cmd.containerId, schoolId: cmd.schoolId },
      this.clock.now(),
    );

    await this.repo.save(enrollment);

    for (const event of enrollment.getDomainEvents()) {
      await this.publisher.publish(
        (event as { eventType: string }).eventType,
        (event as any).payload,
      );
    }
    enrollment.clearDomainEvents();

    this.logger.log(`Enrolled user ${cmd.userId} in container ${cmd.containerId}`);
    return Result.ok(toEnrollmentDto(enrollment));
  }
}
