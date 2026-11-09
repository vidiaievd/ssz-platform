import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EraseDeletedUserCommand } from './erase-deleted-user.command.js';
import {
  DELETED_USER_ERASER,
  type ErasedOrganizationData,
  type IDeletedUserEraser,
} from '../../ports/deleted-user-eraser.interface.js';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.interface.js';
import { GroupMemberRemovedEvent } from '../../../domain/events/group-member-removed.event.js';
import { StudentRemovedEvent } from '../../../domain/events/student-removed.event.js';
import { TutoringStudentRemovedEvent } from '../../../../tutoring/domain/events/tutoring-student-removed.event.js';

/**
 * A deleted learner leaves every school the way a removed one does: the same
 * `school.group.member.removed` / `school.student.removed` / `tutoring.student.removed`, so
 * every projection elsewhere drops them by the path it already knows. Then the rows go —
 * unlike a removal, which archives them for the school's history.
 *
 * Events first, rows second: a failed erase is redelivered and announces again (consumers
 * of the removals are idempotent per user), while the other order could erase and lose them.
 */
@CommandHandler(EraseDeletedUserCommand)
export class EraseDeletedUserHandler implements ICommandHandler<EraseDeletedUserCommand> {
  private readonly logger = new Logger(EraseDeletedUserHandler.name);

  constructor(
    @Inject(DELETED_USER_ERASER) private readonly eraser: IDeletedUserEraser,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(command: EraseDeletedUserCommand): Promise<ErasedOrganizationData> {
    const { userId, email } = command;
    const footprint = await this.eraser.footprint(userId);

    for (const seat of footprint.activeGroupSeats) {
      await this.eventPublisher.publish(
        new GroupMemberRemovedEvent(randomUUID(), seat.schoolId, seat.groupId, userId, seat.courseId),
      );
    }
    for (const schoolId of footprint.activeStudentSchoolIds) {
      await this.eventPublisher.publish(new StudentRemovedEvent(randomUUID(), schoolId, userId));
    }
    for (const tutorGroupId of footprint.tutoringGroupIds) {
      await this.eventPublisher.publish(new TutoringStudentRemovedEvent(randomUUID(), tutorGroupId, userId));
    }

    const erased = await this.eraser.erase(userId, email);
    this.logger.log(`Erased user ${userId}: ${JSON.stringify(erased)}`);
    return erased;
  }
}
