import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetSoloWorkspaceQuery } from './get-solo-workspace.query.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import {
  SCHOOL_GROUP_REPOSITORY,
  type ISchoolGroupRepository,
} from '../../../domain/repositories/school-group.repository.interface.js';

export interface SoloWorkspaceResult {
  schoolId: string;
  /** The one group a tutor's learners belong to; null only if it was deleted by hand. */
  groupId: string | null;
  name: string;
  studentCount: number;
}

/**
 * Where a private tutor's own workspace lives, for callers that only know the tutor
 * (plan 59, phase 2). Returns null when the tutor has none — provisioning is the
 * caller's decision, not this query's.
 */
@QueryHandler(GetSoloWorkspaceQuery)
export class GetSoloWorkspaceHandler implements IQueryHandler<GetSoloWorkspaceQuery> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_GROUP_REPOSITORY) private readonly groupRepository: ISchoolGroupRepository,
  ) {}

  async execute(query: GetSoloWorkspaceQuery): Promise<SoloWorkspaceResult | null> {
    const owned = await this.schoolRepository.findByOwnerId(query.ownerId);
    const workspace = owned.find((s) => s.isSolo && !s.isDeleted);
    if (!workspace) return null;

    const groups = await this.groupRepository.findBySchoolId(workspace.id);
    const group = groups.find((g) => !g.isDeleted) ?? null;

    return {
      schoolId: workspace.id,
      groupId: group?.id ?? null,
      name: workspace.name,
      studentCount: workspace.members.filter((m) => m.role === 'STUDENT').length,
    };
  }
}
