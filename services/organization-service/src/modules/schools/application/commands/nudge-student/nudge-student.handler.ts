import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { HttpException, HttpStatus, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NudgeStudentCommand } from './nudge-student.command.js';
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
import { StudentNudgedEvent } from '../../../domain/events/student-nudged.event.js';

const NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

@CommandHandler(NudgeStudentCommand)
export class NudgeStudentHandler implements ICommandHandler<NudgeStudentCommand, { sent: true }> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: NudgeStudentCommand): Promise<{ sent: true }> {
    const { actorId, schoolId, studentUserId } = command;

    const school = await this.schoolRepository.findById(schoolId);
    if (!school) throw new SchoolNotFoundException(schoolId);

    const targetRole = school.getMemberRole(studentUserId);
    if (targetRole !== MemberRole.STUDENT) {
      throw new MemberNotFoundException(studentUserId);
    }

    const isOwner = actorId === school.ownerId;
    const actorRole = school.getMemberRole(actorId);
    const isUnrestricted = isOwner || actorRole === MemberRole.ADMIN;
    const isTeacher = actorRole === MemberRole.TEACHER;
    if (!isUnrestricted && !isTeacher) {
      throw new ForbiddenOperationException('Not authorized to nudge this student');
    }
    if (isTeacher) {
      const overlap = await (this.prisma as any).schoolGroupMember.findFirst({
        where: {
          userId: studentUserId,
          group: { schoolId, teachers: { some: { userId: actorId } } },
        },
      });
      if (!overlap) throw new ForbiddenOperationException('Not authorized to nudge this student');
    }

    const existing = await (this.prisma as any).studentNudge.findUnique({
      where: { schoolId_studentId: { schoolId, studentId: studentUserId } },
    });
    const now = new Date();
    if (existing) {
      const nextAllowedAt = new Date(existing.lastNudgedAt.getTime() + NUDGE_COOLDOWN_MS);
      if (now < nextAllowedAt) {
        throw new HttpException(
          { error: 'too-soon', nextAllowedAt: nextAllowedAt.toISOString() },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    await (this.prisma as any).studentNudge.upsert({
      where: { schoolId_studentId: { schoolId, studentId: studentUserId } },
      create: { schoolId, studentId: studentUserId, lastNudgedAt: now },
      update: { lastNudgedAt: now },
    });

    await this.eventPublisher.publish(
      new StudentNudgedEvent(randomUUID(), schoolId, studentUserId, actorId),
    );

    return { sent: true };
  }
}
