import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
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
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard.js';
import { VisibilityGuard } from '../../../../shared/access-control/presentation/guards/visibility.guard.js';
import { RequireAccess } from '../../../../shared/access-control/presentation/decorators/require-access.decorator.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { TaggableEntityType } from '../../../../shared/access-control/domain/types/taggable-entity-type.js';
import { SharePermission } from '../../domain/value-objects/share-permission.vo.js';
import { urlSlugToEntityType } from '../../../../shared/access-control/presentation/utils/url-slug-to-entity-type.js';

import { CreateContentShareCommand } from '../../application/commands/create-content-share/create-content-share.command.js';
import { ShareByEmailCommand } from '../../application/commands/share-by-email/share-by-email.command.js';
import { RevokeContentShareCommand } from '../../application/commands/revoke-content-share/revoke-content-share.command.js';
import { ListMySharedWithMeQuery } from '../../application/queries/list-my-shared-with-me/list-my-shared-with-me.query.js';
import { ListSharesForEntityQuery } from '../../application/queries/list-shares-for-entity/list-shares-for-entity.query.js';

import { CreateContentShareRequestDto } from '../dto/requests/create-content-share.request.dto.js';
import { ShareByEmailRequestDto } from '../dto/requests/share-by-email.request.dto.js';
import { ListSharedWithMeRequestDto } from '../dto/requests/list-shared-with-me.request.dto.js';
import { ContentShareResponseDto } from '../dto/responses/content-share.response.dto.js';
import type { ContentShareEntity } from '../../domain/entities/content-share.entity.js';
import type { PaginatedResult } from '../../../../shared/kernel/pagination.js';

@ApiTags('content-shares')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ContentShareController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('content-shares')
  @ApiOperation({ summary: 'Share an entity with a specific user' })
  @ApiCreatedResponse({ type: ContentShareResponseDto })
  async createShare(
    @Body() dto: CreateContentShareRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContentShareResponseDto> {
    const share = await this.commandBus.execute<CreateContentShareCommand, ContentShareEntity>(
      new CreateContentShareCommand(
        user.userId,
        user.isPlatformAdmin,
        dto.entityType,
        dto.entityId,
        dto.sharedWithUserId,
        dto.permission ?? SharePermission.READ,
        dto.expiresAt,
        dto.note,
      ),
    );
    return ContentShareResponseDto.fromEntity(share);
  }

  @Post('content-shares/by-email')
  @ApiOperation({
    summary: 'Share an entity with the owner of an e-mail address',
    description:
      'Edit right on the entity and visibility `shared` are checked before the address is looked up; ' +
      'each lookup counts against the caller (USER_LOOKUP_RATE_LIMIT per USER_LOOKUP_RATE_WINDOW_MS).',
  })
  @ApiCreatedResponse({ type: ContentShareResponseDto })
  @ApiNotFoundResponse({ description: '`USER_NOT_FOUND` — no account has that address (or the entity is gone)' })
  @ApiTooManyRequestsResponse({ description: '`LOOKUP_RATE_LIMITED` with `retryAfterSeconds`' })
  async shareByEmail(
    @Body() dto: ShareByEmailRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContentShareResponseDto> {
    const share = await this.commandBus.execute<ShareByEmailCommand, ContentShareEntity>(
      new ShareByEmailCommand(
        user.userId,
        user.isPlatformAdmin,
        dto.entityType,
        dto.entityId,
        dto.email,
        dto.permission ?? SharePermission.READ,
        dto.expiresAt,
        dto.note,
      ),
    );
    return ContentShareResponseDto.fromEntity(share);
  }

  @Get('me/shared-with-me')
  @ApiOperation({ summary: 'List entities shared with the current user' })
  @ApiOkResponse({ type: ContentShareResponseDto, isArray: true })
  async listSharedWithMe(
    @Query() dto: ListSharedWithMeRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedResult<ContentShareResponseDto>> {
    const result = await this.queryBus.execute<
      ListMySharedWithMeQuery,
      PaginatedResult<ContentShareEntity>
    >(new ListMySharedWithMeQuery(user.userId, dto.page, dto.limit));
    return { ...result, items: result.items.map((s) => ContentShareResponseDto.fromEntity(s)) };
  }

  @Get(':entityType/:entityId/shares')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityTypeParam: 'entityType', idParam: 'entityId' })
  @ApiOperation({ summary: 'List all active shares for an entity (requires edit access)' })
  @ApiOkResponse({ type: ContentShareResponseDto, isArray: true })
  async listSharesForEntity(
    @Param('entityType') entityTypeSlug: string,
    @Param('entityId') entityId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContentShareResponseDto[]> {
    const entityType = this.resolveEntityType(entityTypeSlug);
    const shares = await this.queryBus.execute<ListSharesForEntityQuery, ContentShareEntity[]>(
      new ListSharesForEntityQuery(entityType, entityId, user.userId, user.isPlatformAdmin),
    );
    return shares.map((s) => ContentShareResponseDto.fromEntity(s));
  }

  @Delete('content-shares/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a content share' })
  @ApiNoContentResponse()
  async revokeShare(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.commandBus.execute(
      new RevokeContentShareCommand(id, user.userId, user.isPlatformAdmin),
    );
  }

  private resolveEntityType(slug: string): TaggableEntityType {
    const type = urlSlugToEntityType(slug);
    if (!type) throw new NotFoundException(`Unknown entity type: '${slug}'`);
    return type;
  }
}
