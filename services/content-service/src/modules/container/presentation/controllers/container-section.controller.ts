import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard.js';
import { VisibilityGuard } from '../../../../shared/access-control/presentation/guards/visibility.guard.js';
import { RequireAccess } from '../../../../shared/access-control/presentation/decorators/require-access.decorator.js';
import { TaggableEntityType } from '../../../../shared/access-control/domain/types/taggable-entity-type.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { CreateSectionCommand } from '../../application/commands/create-section/create-section.command.js';
import { RenameSectionCommand } from '../../application/commands/rename-section/rename-section.command.js';
import { ReorderSectionsCommand } from '../../application/commands/reorder-sections/reorder-sections.command.js';
import { DeleteSectionCommand } from '../../application/commands/delete-section/delete-section.command.js';
import { GetVersionSectionsQuery } from '../../application/queries/get-version-sections/get-version-sections.query.js';
import type { Result } from '../../../../shared/kernel/result.js';
import type { ContainerDomainError } from '../../domain/exceptions/container-domain.exceptions.js';
import type { ContainerSectionEntity } from '../../domain/entities/container-section.entity.js';
import { ContainerSectionResponseDto } from '../dto/responses/container-section.response.dto.js';
import { CreateSectionRequestDto } from '../dto/requests/create-section.request.dto.js';
import { RenameSectionRequestDto } from '../dto/requests/rename-section.request.dto.js';
import { ReorderSectionsRequestDto } from '../dto/requests/reorder-sections.request.dto.js';
import { throwHttpException } from '../utils/domain-error.mapper.js';

@ApiTags('Container Sections')
@ApiBearerAuth()
@ApiParam({ name: 'containerId', type: String, description: 'Container ID' })
@UseGuards(JwtAuthGuard)
@Controller('containers/:containerId/versions/:versionId/sections')
export class ContainerSectionController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.CONTAINER, idParam: 'containerId' })
  @ApiOperation({ summary: 'List sections for a container version, ordered by position' })
  @ApiOkResponse({ type: ContainerSectionResponseDto, isArray: true })
  async findAll(@Param('versionId') versionId: string): Promise<ContainerSectionResponseDto[]> {
    const result = await this.queryBus.execute<
      GetVersionSectionsQuery,
      Result<ContainerSectionEntity[], ContainerDomainError>
    >(new GetVersionSectionsQuery(versionId));

    if (result.isFail) throwHttpException(result.error);
    return result.value.map((section) => ContainerSectionResponseDto.from(section));
  }

  @Post()
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.CONTAINER, idParam: 'containerId' })
  @ApiOperation({ summary: 'Create a section in a draft version' })
  @ApiCreatedResponse({ description: 'Returns the new section ID and position' })
  async create(
    @Param('versionId') versionId: string,
    @Body() dto: CreateSectionRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ sectionId: string; position: number }> {
    const result = await this.commandBus.execute<
      CreateSectionCommand,
      Result<{ sectionId: string; position: number }, ContainerDomainError>
    >(new CreateSectionCommand(user.userId, versionId, dto.title, dto.position));

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Patch(':sectionId')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.CONTAINER, idParam: 'containerId' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Rename a section in a draft version' })
  @ApiNoContentResponse()
  async rename(
    @Param('sectionId') sectionId: string,
    @Body() dto: RenameSectionRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      RenameSectionCommand,
      Result<void, ContainerDomainError>
    >(new RenameSectionCommand(user.userId, sectionId, dto.title));

    if (result.isFail) throwHttpException(result.error);
  }

  @Delete(':sectionId')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.CONTAINER, idParam: 'containerId' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a section from a draft version; its items are ungrouped, not deleted',
  })
  @ApiNoContentResponse()
  async remove(
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      DeleteSectionCommand,
      Result<void, ContainerDomainError>
    >(new DeleteSectionCommand(user.userId, sectionId));

    if (result.isFail) throwHttpException(result.error);
  }

  @Put('reorder')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.CONTAINER, idParam: 'containerId' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reorder sections within a draft version' })
  @ApiNoContentResponse()
  async reorder(
    @Param('versionId') versionId: string,
    @Body() dto: ReorderSectionsRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const reorderSections = dto.orderedSectionIds.map((id, index) => ({ id, position: index }));

    const result = await this.commandBus.execute<
      ReorderSectionsCommand,
      Result<void, ContainerDomainError>
    >(new ReorderSectionsCommand(user.userId, versionId, reorderSections));

    if (result.isFail) throwHttpException(result.error);
  }
}
