import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AssignGroupTeacherCommand } from './assign-group-teacher.command.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import {
  SCHOOL_GROUP_REPOSITORY,
  type ISchoolGroupRepository,
} from '../../../domain/repositories/school-group.repository.interface.js';
import {
  GROUP_TEACHER_REPOSITORY,
  type IGroupTeacherRepository,
} from '../../../domain/repositories/group-teacher.repository.interface.js';
import {
  PROFILE_SERVICE_PORT,
  type IProfileServicePort,
} from '../../../../../shared/application/ports/profile-service.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';

export interface AssignGroupTeacherResult {
  ok: boolean;
  warnings: Array<{ type: string }>;
}

@CommandHandler(AssignGroupTeacherCommand)
export class AssignGroupTeacherHandler implements ICommandHandler<AssignGroupTeacherCommand> {
  private readonly logger = new Logger(AssignGroupTeacherHandler.name);

  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_GROUP_REPOSITORY) private readonly groupRepository: ISchoolGroupRepository,
    @Inject(GROUP_TEACHER_REPOSITORY) private readonly teacherRepository: IGroupTeacherRepository,
    @Inject(PROFILE_SERVICE_PORT) private readonly profileService: IProfileServicePort,
  ) {}

  async execute(command: AssignGroupTeacherCommand): Promise<AssignGroupTeacherResult> {
    const school = await this.schoolRepository.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const actorRole = school.getMemberRole(command.actorId);
    const isOwner = command.actorId === school.ownerId;
    const isAdmin = actorRole === MemberRole.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenOperationException('Only owner or admin can assign group teachers');
    }

    const teacherSchoolRole = school.getMemberRole(command.userId);
    if (teacherSchoolRole !== MemberRole.TEACHER) {
      throw new ConflictException('User must be a TEACHER member of this school');
    }

    const group = await this.groupRepository.findById(command.groupId);
    if (!group || group.isDeleted || group.schoolId !== command.schoolId) {
      throw new NotFoundException(`Group ${command.groupId} not found`);
    }

    // substitute requires reason (spec §5)
    if (command.role === 'substitute' && !command.reason) {
      throw new ConflictException('reason is required for substitute assignment');
    }

    const warnings: Array<{ type: string }> = [];

    // ── Language fit (hard block, spec §6) ──────────────────────────────────
    if (group.lang) {
      const profile = await this.profileService.getTutorTeachingLanguages(command.userId);
      if (profile !== null && profile.langs.length > 0 && !profile.langs.includes(group.lang)) {
        throw new ConflictException({
          error: 'language-mismatch',
          message: `Teacher does not teach language "${group.lang}"`,
          teacherLangs: profile.langs,
          requiredLang: group.lang,
        });
      }
    }

    // ── Enforce uniqueness constraints (primary / co_primary) ────────────────
    if (command.role === 'primary' || command.role === 'co_primary') {
      const existing = group.teachers.find((t) => t.role === command.role);
      if (existing && existing.userId !== command.userId) {
        if (!command.override) {
          throw new ConflictException({
            error: `${command.role}-already-assigned`,
            message: `A ${command.role} teacher is already assigned to this group`,
            existingUserId: existing.userId,
          });
        }
        await this.teacherRepository.remove(command.groupId, existing.userId, command.role);
        warnings.push({ type: `replaced-${command.role}` });
      }
    }

    await this.teacherRepository.save({
      id: randomUUID(),
      groupId: command.groupId,
      userId: command.userId,
      role: command.role,
      fromDate: command.fromDate ?? null,
      toDate: command.toDate ?? null,
      reason: command.reason ?? null,
      createdAt: new Date(),
    });

    return { ok: true, warnings };
  }
}
