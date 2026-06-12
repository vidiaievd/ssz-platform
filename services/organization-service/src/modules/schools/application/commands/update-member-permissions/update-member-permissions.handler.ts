import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateMemberPermissionsCommand } from './update-member-permissions.command.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MemberNotFoundException } from '../../../domain/exceptions/member-not-found.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { ALL_CAPABILITIES } from '../../../domain/value-objects/capability.vo.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';

@CommandHandler(UpdateMemberPermissionsCommand)
export class UpdateMemberPermissionsHandler implements ICommandHandler<UpdateMemberPermissionsCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: UpdateMemberPermissionsCommand): Promise<void> {
    const school = await this.schoolRepository.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const isOwner = command.actorId === school.ownerId;
    const actorRole = school.getMemberRole(command.actorId);
    if (!isOwner && actorRole !== MemberRole.ADMIN) {
      throw new ForbiddenOperationException('Only OWNER or ADMIN can manage member permissions');
    }

    const targetRole = school.getMemberRole(command.targetUserId);
    if (targetRole !== MemberRole.MANAGER) {
      throw new ForbiddenOperationException('Capability grants are only supported for MANAGER role members');
    }

    const validCaps = new Set<string>(ALL_CAPABILITIES);
    for (const cap of command.capabilities) {
      if (!validCaps.has(cap)) {
        throw new ForbiddenOperationException(`Unknown capability: "${cap}"`);
      }
    }

    const member = await (this.prisma as any).schoolMember.findUnique({
      where: { schoolId_userId: { schoolId: command.schoolId, userId: command.targetUserId } },
    });
    if (!member) throw new MemberNotFoundException(command.targetUserId);

    await (this.prisma as any).schoolMemberPermission.upsert({
      where: { schoolId_userId: { schoolId: command.schoolId, userId: command.targetUserId } },
      create: {
        schoolId: command.schoolId,
        userId: command.targetUserId,
        memberId: member.id,
        capabilities: command.capabilities,
        updatedAt: new Date(),
      },
      update: {
        capabilities: command.capabilities,
        updatedAt: new Date(),
      },
    });
  }
}
