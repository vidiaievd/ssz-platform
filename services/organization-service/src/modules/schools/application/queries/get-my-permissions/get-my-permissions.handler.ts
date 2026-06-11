import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetMyPermissionsQuery } from './get-my-permissions.query.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { CapabilityResolverService } from '../../services/capability-resolver.service.js';

export interface MyPermissionsResult {
  role: string | null;
  capabilities: string[];
}

@QueryHandler(GetMyPermissionsQuery)
export class GetMyPermissionsHandler implements IQueryHandler<GetMyPermissionsQuery, MyPermissionsResult> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    private readonly capabilityResolver: CapabilityResolverService,
  ) {}

  async execute(query: GetMyPermissionsQuery): Promise<MyPermissionsResult> {
    const school = await this.schoolRepository.findById(query.schoolId);
    if (!school) throw new SchoolNotFoundException(query.schoolId);

    const role = school.getMemberRole(query.actorId) ?? null;
    const caps = await this.capabilityResolver.getEffectiveCapabilities(
      query.actorId,
      query.schoolId,
      school,
    );
    return { role, capabilities: [...caps].sort() };
  }
}
