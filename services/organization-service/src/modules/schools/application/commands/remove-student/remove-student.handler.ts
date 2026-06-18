import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RemoveStudentCommand } from './remove-student.command.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { MemberNotFoundException } from '../../../domain/exceptions/member-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { GroupMemberRemovedEvent } from '../../../domain/events/group-member-removed.event.js';
import { StudentRemovedEvent } from '../../../domain/events/student-removed.event.js';

@CommandHandler(RemoveStudentCommand)
export class RemoveStudentHandler implements ICommandHandler<RemoveStudentCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: RemoveStudentCommand): Promise<void> {
    const { actorId, schoolId, studentUserId } = command;

    const school = await this.schoolRepository.findById(schoolId);
    if (!school) throw new SchoolNotFoundException(schoolId);

    const targetRole = school.getMemberRole(studentUserId);
    if (targetRole !== MemberRole.STUDENT) {
      throw new MemberNotFoundException(studentUserId);
    }

    const isOwner = actorId === school.ownerId;
    const actorRole = school.getMemberRole(actorId);
    if (!isOwner && actorRole !== MemberRole.ADMIN) {
      throw new ForbiddenOperationException('Only owner or admin can remove a student from the school');
    }

    // Deactivate rather than hard-delete: keep school_member + history rows
    // (membership/level history must remain readable after removal — see SD.1/SD.2).
    const activeMemberships = await (this.prisma as any).schoolGroupMember.findMany({
      where: { userId: studentUserId, status: 'active', group: { schoolId } },
      include: { group: true },
    });

    const now = new Date();
    await this.prisma.$transaction([
      (this.prisma as any).schoolGroupMember.updateMany({
        where: { userId: studentUserId, status: 'active', group: { schoolId } },
        data: { status: 'past', exitedAt: now },
      }),
      (this.prisma as any).schoolMember.update({
        where: { schoolId_userId: { schoolId, userId: studentUserId } },
        data: { status: 'archived' },
      }),
    ] as any);

    for (const membership of activeMemberships) {
      await this.eventPublisher.publish(
        new GroupMemberRemovedEvent(
          randomUUID(),
          schoolId,
          membership.groupId,
          studentUserId,
          membership.group.courseId ?? null,
        ),
      );
    }

    await this.eventPublisher.publish(new StudentRemovedEvent(randomUUID(), schoolId, studentUserId));
  }
}
