import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetWorkspaceQuery } from './get-workspace.query.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import type { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import type { SchoolKind } from '../../../domain/value-objects/school-kind.vo.js';

/** The whole answer a screen needs before it can draw itself: which shell, whose, what may I do. */
export interface WorkspaceResult {
  id: string;
  kind: SchoolKind;
  name: string;
  /** A school's URL slug. Kept for links that still carry one; a solo workspace's is internal. */
  slug: string | null;
  myRole: MemberRole;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve one workspace for the caller — a school or a private tutor's own space, answered
 * the same way so that a screen can be addressed by workspace instead of by contour
 * (plan 61, phase 0).
 *
 * A stranger and a non-existent workspace get the same "not found". Telling them apart
 * would turn this route into a directory of every school on the platform, and for a solo
 * workspace it would say which accounts tutor.
 */
@QueryHandler(GetWorkspaceQuery)
export class GetWorkspaceHandler implements IQueryHandler<GetWorkspaceQuery> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
  ) {}

  async execute(query: GetWorkspaceQuery): Promise<WorkspaceResult> {
    // The id column is a uuid: handing it a slug is not a miss, it is a database error.
    const byId = UUID.test(query.idOrSlug)
      ? await this.schoolRepository.findById(query.idOrSlug)
      : null;
    const workspace = byId ?? (await this.schoolRepository.findBySlug(query.idOrSlug));

    if (!workspace || workspace.isDeleted) {
      throw new SchoolNotFoundException(query.idOrSlug);
    }

    // A solo workspace has exactly one person standing in it. Its learners are members —
    // that is how assignments and review work at all — but a learner resolving it would be
    // handed the tutor's shell, so for them it does not exist either.
    if (workspace.isSolo && workspace.ownerId !== query.actorId) {
      throw new SchoolNotFoundException(query.idOrSlug);
    }

    const role = workspace.roleOf(query.actorId);
    if (!role) {
      throw new SchoolNotFoundException(query.idOrSlug);
    }

    return {
      id: workspace.id,
      kind: workspace.kind,
      name: workspace.name,
      slug: workspace.isSolo ? null : workspace.slug,
      myRole: role,
    };
  }
}
