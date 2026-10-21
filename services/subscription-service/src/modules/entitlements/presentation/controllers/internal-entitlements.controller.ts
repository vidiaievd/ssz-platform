import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { ResolveEntitlementsQuery } from '../../application/queries/resolve-entitlements/resolve-entitlements.query.js';
import type { Entitlements } from '../../domain/entitlements.js';
import { EntitlementsQueryDto } from '../dto/entitlements.dto.js';

/**
 * What a payer may use, for the services that enforce it (ai-service first). Answers for
 * any payer, seen or not — one never seen is on its free plan.
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/entitlements')
export class InternalEntitlementsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  get(@Query() q: EntitlementsQueryDto): Promise<Entitlements> {
    return this.queryBus.execute(new ResolveEntitlementsQuery(q.type, q.id));
  }
}
