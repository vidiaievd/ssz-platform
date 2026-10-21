import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { resolveEntitlements, type Entitlements } from '../../../domain/entitlements.js';
import { ENTITLEMENT_INPUTS_READER, type IEntitlementInputsReader } from '../../ports/entitlement-inputs.reader.js';
import { ResolveEntitlementsQuery } from './resolve-entitlements.query.js';

@QueryHandler(ResolveEntitlementsQuery)
export class ResolveEntitlementsHandler implements IQueryHandler<ResolveEntitlementsQuery, Entitlements> {
  constructor(@Inject(ENTITLEMENT_INPUTS_READER) private readonly inputs: IEntitlementInputsReader) {}

  async execute(query: ResolveEntitlementsQuery): Promise<Entitlements> {
    const now = new Date();
    return resolveEntitlements(await this.inputs.load(query.type, query.externalId, now));
  }
}
