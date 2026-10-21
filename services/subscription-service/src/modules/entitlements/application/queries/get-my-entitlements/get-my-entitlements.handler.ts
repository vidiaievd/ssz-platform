import { ForbiddenException, Inject } from '@nestjs/common';
import { QueryBus, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import type { Entitlements } from '../../../domain/entitlements.js';
import { ORGANIZATION_CLIENT, type IOrganizationClient } from '../../ports/organization.client.js';
import { GetMyEntitlementsQuery } from './get-my-entitlements.query.js';
import { ResolveEntitlementsQuery } from '../resolve-entitlements/resolve-entitlements.query.js';

/**
 * For the UI only — hiding buttons. A workspace's entitlements are shown to anyone in it
 * (a school's learners run on the school's plan, plan 48 R1), and to no one else: the
 * answer reveals what the school pays for.
 */
@QueryHandler(GetMyEntitlementsQuery)
export class GetMyEntitlementsHandler implements IQueryHandler<GetMyEntitlementsQuery, Entitlements> {
  constructor(
    private readonly queryBus: QueryBus,
    @Inject(ORGANIZATION_CLIENT) private readonly organizations: IOrganizationClient,
  ) {}

  async execute(query: GetMyEntitlementsQuery): Promise<Entitlements> {
    if (query.workspaceId === null) {
      return this.queryBus.execute(new ResolveEntitlementsQuery('user', query.userId));
    }
    const role = await this.organizations.memberRole(query.workspaceId, query.userId);
    if (role === null) throw new ForbiddenException('Not a member of this workspace');
    return this.queryBus.execute(new ResolveEntitlementsQuery('workspace', query.workspaceId));
  }
}
