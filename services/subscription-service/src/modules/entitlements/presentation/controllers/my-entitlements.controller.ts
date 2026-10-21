import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { GetMyEntitlementsQuery } from '../../application/queries/get-my-entitlements/get-my-entitlements.query.js';
import type { Entitlements } from '../../domain/entitlements.js';
import { EntitlementsResponseDto, FeatureEntitlementDto, MyEntitlementsQueryDto } from '../dto/entitlements.dto.js';

@ApiTags('Entitlements')
@ApiBearerAuth()
@ApiExtraModels(FeatureEntitlementDto)
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@Controller('subscriptions')
export class MyEntitlementsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('me')
  @ApiOperation({
    summary: 'Entitlements of the current context',
    description:
      "With `workspaceId` — that workspace's (the caller must belong to it); without — the caller's own. " +
      'For hiding UI only: the services that run a feature check entitlements themselves.',
  })
  @ApiOkResponse({ type: EntitlementsResponseDto })
  @ApiForbiddenResponse({ description: 'Not a member of the workspace' })
  @ApiServiceUnavailableResponse({ description: 'Membership could not be checked' })
  me(@Query() q: MyEntitlementsQueryDto, @CurrentUser() user: AuthenticatedUser): Promise<Entitlements> {
    return this.queryBus.execute(new GetMyEntitlementsQuery(user.userId, q.workspaceId ?? null));
  }
}
