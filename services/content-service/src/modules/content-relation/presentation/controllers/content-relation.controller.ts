import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Body,
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
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';

import { CreateContentRelationCommand } from '../../application/commands/create-content-relation/create-content-relation.command.js';
import { DeleteContentRelationCommand } from '../../application/commands/delete-content-relation/delete-content-relation.command.js';
import { ListRelationsBySourceQuery } from '../../application/queries/list-relations-by-source/list-relations-by-source.query.js';
import { ListRelationsByTargetQuery } from '../../application/queries/list-relations-by-target/list-relations-by-target.query.js';

import { CreateContentRelationRequestDto } from '../dto/requests/create-content-relation.request.dto.js';
import { ListContentRelationsRequestDto } from '../dto/requests/list-content-relations.request.dto.js';
import { ContentRelationResponseDto } from '../dto/responses/content-relation.response.dto.js';
import type { ContentRelationEntity } from '../../domain/entities/content-relation.entity.js';

@ApiTags('content-relations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('content-relations')
export class ContentRelationController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List content relations by source or by target (exactly one pair required)',
  })
  @ApiOkResponse({ type: ContentRelationResponseDto, isArray: true })
  async listRelations(
    @Query() dto: ListContentRelationsRequestDto,
  ): Promise<ContentRelationResponseDto[]> {
    const hasSource = !!dto.sourceType && !!dto.sourceId;
    const hasTarget = !!dto.targetType && !!dto.targetId;

    if (hasSource === hasTarget) {
      throw new BadRequestException(
        'Provide either (sourceType, sourceId) or (targetType, targetId), not both or neither',
      );
    }

    const relations = hasSource
      ? await this.queryBus.execute<ListRelationsBySourceQuery, ContentRelationEntity[]>(
          new ListRelationsBySourceQuery(dto.sourceType!, dto.sourceId!, dto.relationKind),
        )
      : await this.queryBus.execute<ListRelationsByTargetQuery, ContentRelationEntity[]>(
          new ListRelationsByTargetQuery(dto.targetType!, dto.targetId!, dto.relationKind),
        );

    return relations.map((r) => ContentRelationResponseDto.fromEntity(r));
  }

  @Post()
  @ApiOperation({ summary: 'Create a content relation (idempotent on the same edge)' })
  @ApiCreatedResponse({ type: ContentRelationResponseDto })
  async createRelation(
    @Body() dto: CreateContentRelationRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContentRelationResponseDto> {
    const relation = await this.commandBus.execute<
      CreateContentRelationCommand,
      ContentRelationEntity
    >(
      new CreateContentRelationCommand(
        dto.sourceType,
        dto.sourceId,
        dto.relationKind,
        dto.targetType,
        dto.targetId,
        dto.ownerSchoolId ?? null,
        user.userId,
      ),
    );
    return ContentRelationResponseDto.fromEntity(relation);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Hard-delete a content relation (explicit unlink)' })
  @ApiNoContentResponse()
  async deleteRelation(@Param('id') id: string): Promise<void> {
    await this.commandBus.execute(new DeleteContentRelationCommand(id));
  }
}
