import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard.js';
import { VisibilityGuard } from '../../../../shared/access-control/presentation/guards/visibility.guard.js';
import { RequireAccess } from '../../../../shared/access-control/presentation/decorators/require-access.decorator.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { TaggableEntityType } from '../../../../shared/access-control/domain/types/taggable-entity-type.js';

import { GrantEntitlementCommand } from '../../application/commands/grant-entitlement/grant-entitlement.command.js';
import { RevokeEntitlementCommand } from '../../application/commands/revoke-entitlement/revoke-entitlement.command.js';
import { ListMyEntitlementsQuery } from '../../application/queries/list-my-entitlements/list-my-entitlements.query.js';
import { GetEntitlementsForContainerQuery } from '../../application/queries/get-entitlements-for-container/get-entitlements-for-container.query.js';

import { GrantEntitlementRequestDto } from '../dto/requests/grant-entitlement.request.dto.js';
import { ListEntitlementsRequestDto } from '../dto/requests/list-entitlements.request.dto.js';
import { ContentEntitlementResponseDto } from '../dto/responses/content-entitlement.response.dto.js';
import type { ContentEntitlementEntity } from '../../domain/entities/content-entitlement.entity.js';
import type { PaginatedResult } from '../../../../shared/kernel/pagination.js';

@ApiTags('entitlements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class EntitlementController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('containers/:id/entitlements')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.CONTAINER, idParam: 'id' })
  @ApiOperation({ summary: 'Grant a manual entitlement to a user for a container' })
  @ApiCreatedResponse({ type: ContentEntitlementResponseDto })
  async grantEntitlement(
    @Param('id') containerId: string,
    @Body() dto: GrantEntitlementRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContentEntitlementResponseDto> {
    const entitlement = await this.commandBus.execute<
      GrantEntitlementCommand,
      ContentEntitlementEntity
    >(
      new GrantEntitlementCommand(
        user.userId,
        user.isPlatformAdmin,
        containerId,
        dto.userId,
        dto.entitlementType,
        dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        dto.sourceReference,
        dto.metadata,
      ),
    );
    return ContentEntitlementResponseDto.fromEntity(entitlement);
  }

  @Get('me/entitlements')
  @ApiOperation({ summary: 'List active entitlements for the current user' })
  @ApiOkResponse({ type: ContentEntitlementResponseDto, isArray: true })
  async listMyEntitlements(
    @Query() dto: ListEntitlementsRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedResult<ContentEntitlementResponseDto>> {
    const result = await this.queryBus.execute<
      ListMyEntitlementsQuery,
      PaginatedResult<ContentEntitlementEntity>
    >(new ListMyEntitlementsQuery(user.userId, dto.page, dto.limit));
    return {
      ...result,
      items: result.items.map((e) => ContentEntitlementResponseDto.fromEntity(e)),
    };
  }

  @Get('containers/:id/entitlements')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.CONTAINER, idParam: 'id' })
  @ApiOperation({ summary: 'List entitlements for a container (requires edit access)' })
  @ApiOkResponse({ type: ContentEntitlementResponseDto, isArray: true })
  async getEntitlementsForContainer(
    @Param('id') containerId: string,
    @Query() dto: ListEntitlementsRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedResult<ContentEntitlementResponseDto>> {
    const result = await this.queryBus.execute<
      GetEntitlementsForContainerQuery,
      PaginatedResult<ContentEntitlementEntity>
    >(
      new GetEntitlementsForContainerQuery(
        containerId,
        user.userId,
        user.isPlatformAdmin,
        dto.page,
        dto.limit,
      ),
    );
    return {
      ...result,
      items: result.items.map((e) => ContentEntitlementResponseDto.fromEntity(e)),
    };
  }

  @Delete('content-entitlements/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a content entitlement' })
  @ApiNoContentResponse()
  async revokeEntitlement(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.commandBus.execute(
      new RevokeEntitlementCommand(id, user.userId, user.isPlatformAdmin),
    );
  }
}
