import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ENROLLMENT_REPOSITORY, type IEnrollmentRepository } from '../../domain/repositories/enrollment.repository.interface.js';
import { LEARNING_EVENT_PUBLISHER, type IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import { Result } from '../../../../shared/kernel/result.js';
import { toEnrollmentDto, type EnrollmentDto } from '../dto/enrollment.dto.js';
import {
  EnrollmentNotFoundError,
  EnrollmentForbiddenError,
  EnrollmentDomainValidationError,
  type EnrollmentApplicationError,
} from '../errors/enrollment-application.errors.js';
import { UnenrollFromContainerCommand } from './unenroll-from-container.command.js';

@CommandHandler(UnenrollFromContainerCommand)
export class UnenrollFromContainerHandler
  implements ICommandHandler<UnenrollFromContainerCommand, Result<EnrollmentDto, EnrollmentApplicationError>>
{
  private readonly logger = new Logger(UnenrollFromContainerHandler.name);

  constructor(
    @Inject(ENROLLMENT_REPOSITORY) private readonly repo: IEnrollmentRepository,
    @Inject(LEARNING_EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
  ) {}

  async execute(cmd: UnenrollFromContainerCommand): Promise<Result<EnrollmentDto, EnrollmentApplicationError>> {
    const enrollment = await this.repo.findById(cmd.enrollmentId);
    if (!enrollment) {
      return Result.fail(new EnrollmentNotFoundError(cmd.enrollmentId));
    }

    if (enrollment.userId !== cmd.requestingUserId) {
      return Result.fail(new EnrollmentForbiddenError('only the enrolled user can unenroll'));
    }

    const result = enrollment.unenroll(cmd.reason);
    if (result.isFail) {
      return Result.fail(new EnrollmentDomainValidationError(result.error.message));
    }

    await this.repo.save(enrollment);

    for (const event of enrollment.getDomainEvents()) {
      await this.publisher.publish(
        (event as { eventType: string }).eventType,
        event,
      );
    }
    enrollment.clearDomainEvents();

    this.logger.log(`User ${cmd.requestingUserId} unenrolled from enrollment ${cmd.enrollmentId}`);
    return Result.ok(toEnrollmentDto(enrollment));
  }
}
