import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { UpdateTeacherAttrsCommand } from './update-teacher-attrs.command.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';

@CommandHandler(UpdateTeacherAttrsCommand)
export class UpdateTeacherAttrsHandler implements ICommandHandler<UpdateTeacherAttrsCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: UpdateTeacherAttrsCommand): Promise<void> {
    const school = await this.schoolRepository.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const actorRole = school.getMemberRole(command.actorId);
    const isOwner = command.actorId === school.ownerId;
    const isAdmin = actorRole === MemberRole.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenOperationException('Only owner or admin can update teacher attributes');
    }

    // Resolve SchoolMember record for the target teacher
    const member = await (this.prisma as any).schoolMember.findUnique({
      where: { schoolId_userId: { schoolId: command.schoolId, userId: command.userId } },
    });
    if (!member || member.role !== MemberRole.TEACHER) {
      throw new NotFoundException('Teacher not found in this school');
    }

    const update: Record<string, unknown> = {};
    if (command.maxWeeklyHours !== undefined) update['maxWeeklyHours'] = command.maxWeeklyHours;
    if (command.availability !== undefined) update['availability'] = command.availability;
    if (command.employmentType !== undefined) update['employmentType'] = command.employmentType;
    if (command.status !== undefined) update['status'] = command.status;

    await (this.prisma as any).schoolTeacher.upsert({
      where: { schoolId_userId: { schoolId: command.schoolId, userId: command.userId } },
      create: {
        schoolId: command.schoolId,
        userId: command.userId,
        memberId: member.id,
        maxWeeklyHours: command.maxWeeklyHours ?? null,
        availability: command.availability ?? null,
        employmentType: command.employmentType ?? null,
        status: command.status ?? 'active',
      },
      update,
    });
  }
}
