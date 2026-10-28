import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetAssistantAccessQuery } from './get-assistant-access.query.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import type {
  AssistantAccess,
  AssistantMode,
} from '../../../domain/value-objects/assistant-access.vo.js';

export interface AssistantAccessDto {
  mode: AssistantMode;
  groupIds: string[];
  studentIds: string[];
}

export function toAssistantAccessDto(access: AssistantAccess): AssistantAccessDto {
  return { mode: access.mode, groupIds: [...access.groupIds], studentIds: [...access.studentIds] };
}

/**
 * The school's choice, its lists cut to the groups and students that are still its own —
 * so the settings screen never shows, and never sends back, a deleted group or an archived
 * student. The row keeps them until the next save; the standing check ignores them anyway.
 *
 * The owner's and administrators' only: the list names students one by one.
 */
@QueryHandler(GetAssistantAccessQuery)
export class GetAssistantAccessHandler implements IQueryHandler<GetAssistantAccessQuery> {
  constructor(@Inject(SCHOOL_REPOSITORY) private readonly schools: ISchoolRepository) {}

  async execute(query: GetAssistantAccessQuery): Promise<AssistantAccessDto> {
    const school = await this.schools.findById(query.schoolId);
    if (!school) throw new SchoolNotFoundException(query.schoolId);
    const canRead = query.actorId === school.ownerId || school.getMemberRole(query.actorId) === MemberRole.ADMIN;
    if (!canRead) throw new ForbiddenOperationException('Only owner or admin can read the assistant settings');

    const access = await this.schools.findAssistantAccess(school.id);
    if (!access) throw new SchoolNotFoundException(query.schoolId);
    const live = await this.schools.findAssistantSelectable(school.id, access.groupIds, access.studentIds);
    return toAssistantAccessDto(access.keeping(live.groupIds, live.studentIds));
  }
}
