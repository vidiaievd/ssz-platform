import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateStudentCommand } from './update-student.command.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { MemberNotFoundException } from '../../../domain/exceptions/member-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';

@CommandHandler(UpdateStudentCommand)
export class UpdateStudentHandler implements ICommandHandler<UpdateStudentCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: UpdateStudentCommand): Promise<void> {
    const { actorId, schoolId, studentUserId, status, level } = command;

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

    if (!isUnrestricted) {
      if (!isTeacher) {
        throw new ForbiddenOperationException('Not authorized to update this student');
      }
      if (status !== undefined) {
        throw new ForbiddenOperationException('Only OWNER/ADMIN can change student status');
      }
      const overlap = await (this.prisma as any).schoolGroupMember.findFirst({
        where: {
          userId: studentUserId,
          group: { schoolId, teachers: { some: { userId: actorId } } },
        },
      });
      if (!overlap) {
        throw new ForbiddenOperationException('Not authorized to update this student');
      }
    }

    const member = await (this.prisma as any).schoolMember.findUnique({
      where: { schoolId_userId: { schoolId, userId: studentUserId } },
    });
    if (!member) throw new MemberNotFoundException(studentUserId);

    const ops: unknown[] = [];

    if (status !== undefined || (level !== undefined && level !== member.level)) {
      ops.push(
        (this.prisma as any).schoolMember.update({
          where: { schoolId_userId: { schoolId, userId: studentUserId } },
          data: {
            ...(status !== undefined ? { status } : {}),
            ...(level !== undefined ? { level } : {}),
          },
        }),
      );
    }

    if (level !== undefined && level !== member.level) {
      const now = new Date();
      ops.push(
        (this.prisma as any).studentLevelHistory.updateMany({
          where: { schoolId, studentId: studentUserId, endedAt: null },
          data: { endedAt: now },
        }),
        (this.prisma as any).studentLevelHistory.create({
          data: {
            schoolId,
            studentId: studentUserId,
            level,
            startedAt: now,
            assessedBy: actorId,
          },
        }),
      );
    }

    if (ops.length > 0) {
      await this.prisma.$transaction(ops as any);
    }
  }
}
