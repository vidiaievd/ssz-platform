import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import { urlSlugToEntityType } from '../../../../shared/access-control/presentation/utils/url-slug-to-entity-type.js';
import { NotFoundException } from '@nestjs/common';

import { CreateTagCommand } from '../../application/commands/create-tag/create-tag.command.js';
import { UpdateTagCommand } from '../../application/commands/update-tag/update-tag.command.js';
import { DeleteTagCommand } from '../../application/commands/delete-tag/delete-tag.command.js';
import { AssignTagCommand } from '../../application/commands/assign-tag/assign-tag.command.js';
import { RemoveTagAssignmentCommand } from '../../application/commands/remove-tag-assignment/remove-tag-assignment.command.js';
import { ListTagsQuery } from '../../application/queries/list-tags/list-tags.query.js';
import { GetTagByIdQuery } from '../../application/queries/get-tag-by-id/get-tag-by-id.query.js';
import { GetTagsForEntityQuery } from '../../application/queries/get-tags-for-entity/get-tags-for-entity.query.js';

import { CreateTagRequestDto } from '../dto/requests/create-tag.request.dto.js';
import { UpdateTagRequestDto } from '../dto/requests/update-tag.request.dto.js';
import { AssignTagRequestDto } from '../dto/requests/assign-tag.request.dto.js';
import { ListTagsRequestDto } from '../dto/requests/list-tags.request.dto.js';
import { TagResponseDto } from '../dto/responses/tag.response.dto.js';
import type { TagEntity } from '../../domain/entities/tag.entity.js';
import type { PaginatedResult } from '../../../../shared/kernel/pagination.js';
import { Result } from '../../../../shared/kernel/result.js';
import { TagDomainError } from '../../domain/exceptions/tag-domain.exceptions.js';

@ApiTags('tags')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class TagController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  // ── Global tag CRUD ───────────────────────────────────────────────────────

  @Get('tags')
  @ApiOperation({ summary: 'List tags (global and/or school-scoped)' })
  @ApiOkResponse({ type: TagResponseDto, isArray: true })
  async listTags(
    @Query() dto: ListTagsRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedResult<TagResponseDto>> {
    const result = await this.queryBus.execute<ListTagsQuery, PaginatedResult<TagEntity>>(
      new ListTagsQuery(
        user.userId,
        user.isPlatformAdmin,
        dto.scope,
        dto.category,
        dto.schoolId,
        dto.search,
        dto.page,
        dto.limit,
      ),
    );
    return { ...result, items: result.items.map((e) => TagResponseDto.fromEntity(e)) };
  }

  @Get('tags/:id')
  @ApiOperation({ summary: 'Get a tag by id' })
  @ApiOkResponse({ type: TagResponseDto })
  async getTag(@Param('id') id: string): Promise<TagResponseDto> {
    const tag = await this.queryBus.execute<GetTagByIdQuery, TagEntity>(new GetTagByIdQuery(id));
    return TagResponseDto.fromEntity(tag);
  }

  @Post('tags')
  @ApiOperation({ summary: 'Create a tag (global: platform admin; school: content_admin/owner)' })
  @ApiCreatedResponse({ type: TagResponseDto })
  async createTag(
    @Body() dto: CreateTagRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TagResponseDto> {
    const result = await this.commandBus.execute<
      CreateTagCommand,
      Result<TagEntity, TagDomainError>
    >(
      new CreateTagCommand(
        user.userId,
        user.isPlatformAdmin,
        dto.name,
        dto.category,
        dto.scope,
        dto.ownerSchoolId,
      ),
    );
    if (result.isFail) throw new BadRequestException(result.error);
    return TagResponseDto.fromEntity(result.value);
  }

  @Patch('tags/:id')
  @ApiOperation({ summary: 'Update a tag name or category (slug is immutable)' })
  @ApiOkResponse({ type: TagResponseDto })
  async updateTag(
    @Param('id') id: string,
    @Body() dto: UpdateTagRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TagResponseDto> {
    const result = await this.commandBus.execute<
      UpdateTagCommand,
      Result<TagEntity, TagDomainError>
    >(new UpdateTagCommand(id, user.userId, user.isPlatformAdmin, dto.name, dto.category));
    if (result.isFail) throw new BadRequestException(result.error);
    return TagResponseDto.fromEntity(result.value);
  }

  @Delete('tags/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a tag' })
  @ApiNoContentResponse()
  async deleteTag(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.commandBus.execute(new DeleteTagCommand(id, user.userId, user.isPlatformAdmin));
  }

  // ── Tag assignments (entity-scoped) ───────────────────────────────────────

  @Get(':entityType/:entityId/tags')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityTypeParam: 'entityType', idParam: 'entityId' })
  @ApiOperation({ summary: 'List all tags assigned to an entity' })
  @ApiOkResponse({ type: TagResponseDto, isArray: true })
  async getTagsForEntity(
    @Param('entityType') entityTypeSlug: string,
    @Param('entityId') entityId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TagResponseDto[]> {
    const entityType = this.resolveEntityType(entityTypeSlug);
    const tags = await this.queryBus.execute<GetTagsForEntityQuery, TagEntity[]>(
      new GetTagsForEntityQuery(entityType, entityId, user.userId, user.isPlatformAdmin),
    );
    return tags.map((t) => TagResponseDto.fromEntity(t));
  }

  @Post(':entityType/:entityId/tags')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityTypeParam: 'entityType', idParam: 'entityId' })
  @ApiOperation({ summary: 'Assign a tag to an entity' })
  @ApiCreatedResponse({ description: 'Tag assigned' })
  async assignTag(
    @Param('entityType') entityTypeSlug: string,
    @Param('entityId') entityId: string,
    @Body() dto: AssignTagRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const entityType = this.resolveEntityType(entityTypeSlug);
    await this.commandBus.execute(
      new AssignTagCommand(dto.tagId, entityType, entityId, user.userId, user.isPlatformAdmin),
    );
  }

  @Delete(':entityType/:entityId/tags/:tagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityTypeParam: 'entityType', idParam: 'entityId' })
  @ApiOperation({ summary: 'Remove a tag from an entity' })
  @ApiNoContentResponse()
  async removeTagAssignment(
    @Param('entityType') entityTypeSlug: string,
    @Param('entityId') entityId: string,
    @Param('tagId') tagId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const entityType = this.resolveEntityType(entityTypeSlug);
    await this.commandBus.execute(
      new RemoveTagAssignmentCommand(
        tagId,
        entityType,
        entityId,
        user.userId,
        user.isPlatformAdmin,
      ),
    );
  }

  private resolveEntityType(slug: string): TaggableEntityType {
    const type = urlSlugToEntityType(slug);
    if (!type) throw new NotFoundException(`Unknown entity type: '${slug}'`);
    return type;
  }
}
