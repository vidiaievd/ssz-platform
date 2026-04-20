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
import { CreateContainerCommand } from '../../application/commands/create-container/create-container.command.js';
import type { CreateContainerResult } from '../../application/commands/create-container/create-container.handler.js';
import { UpdateContainerCommand } from '../../application/commands/update-container/update-container.command.js';
import { DeleteContainerCommand } from '../../application/commands/delete-container/delete-container.command.js';
import { CreateDraftFromPublishedCommand } from '../../application/commands/create-draft-from-published/create-draft-from-published.command.js';
import { CreateLocalizationCommand } from '../../application/commands/create-localization/create-localization.command.js';
import { UpdateLocalizationCommand } from '../../application/commands/update-localization/update-localization.command.js';
import { DeleteLocalizationCommand } from '../../application/commands/delete-localization/delete-localization.command.js';
import { GetContainerQuery } from '../../application/queries/get-container/get-container.query.js';
import type { GetContainerResult } from '../../application/queries/get-container/get-container.handler.js';
import { GetContainersQuery } from '../../application/queries/get-containers/get-containers.query.js';
import { GetContainerBySlugQuery } from '../../application/queries/get-container-by-slug/get-container-by-slug.query.js';
import type { Result } from '../../../../shared/kernel/result.js';
import type { PaginatedResult } from '../../../../shared/kernel/pagination.js';
import type { ContainerDomainError } from '../../domain/exceptions/container-domain.exceptions.js';
import type { ContainerEntity } from '../../domain/entities/container.entity.js';
import { ContainerResponseDto } from '../dto/responses/container.response.dto.js';
import { ContainerLocalizationResponseDto } from '../dto/responses/container-localization.response.dto.js';
import { PaginatedResponseDto } from '../dto/responses/paginated.response.dto.js';
import { CreateContainerRequestDto } from '../dto/requests/create-container.request.dto.js';
import { UpdateContainerRequestDto } from '../dto/requests/update-container.request.dto.js';
import { GetContainersFilterRequestDto } from '../dto/requests/get-containers-filter.request.dto.js';
import { CreateLocalizationRequestDto } from '../dto/requests/create-localization.request.dto.js';
import { UpdateLocalizationRequestDto } from '../dto/requests/update-localization.request.dto.js';
import { throwHttpException } from '../utils/domain-error.mapper.js';

@ApiTags('Containers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('containers')
export class ContainerController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new container with an initial draft version' })
  @ApiCreatedResponse({ type: ContainerResponseDto })
  async create(
    @Body() dto: CreateContainerRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContainerResponseDto> {
    const result = await this.commandBus.execute<
      CreateContainerCommand,
      Result<CreateContainerResult, ContainerDomainError>
    >(
      new CreateContainerCommand(
        user.userId,
        dto.containerType,
        dto.targetLanguage,
        dto.difficultyLevel,
        dto.title,
        dto.visibility,
        dto.description,
        dto.coverImageMediaId,
        dto.ownerSchoolId,
        dto.accessTier,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
    const { container } = result.value;
    return ContainerResponseDto.from(container);
  }

  @Get()
  @ApiOperation({ summary: 'List containers with optional filters and pagination' })
  @ApiOkResponse({ type: PaginatedResponseDto })
  async findAll(
    @Query() filter: GetContainersFilterRequestDto,
  ): Promise<PaginatedResponseDto<ContainerResponseDto>> {
    const paged = await this.queryBus.execute<GetContainersQuery, PaginatedResult<ContainerEntity>>(
      new GetContainersQuery({
        containerType: filter.containerType,
        targetLanguage: filter.targetLanguage,
        difficultyLevel: filter.difficultyLevel,
        visibility: filter.visibility,
        ownerUserId: filter.ownerUserId,
        ownerSchoolId: filter.ownerSchoolId,
        page: filter.page ?? 1,
        limit: filter.limit ?? 20,
      }),
    );

    console.log(`[[ Found ]] ${paged.total}`);
    return new PaginatedResponseDto({
      items: paged.items.map((c) => ContainerResponseDto.from(c)),
      total: paged.total,
      page: paged.page,
      limit: paged.limit,
      totalPages: paged.totalPages,
    });
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get a published container by its URL slug' })
  @ApiOkResponse({ type: ContainerResponseDto })
  async findBySlug(@Param('slug') slug: string): Promise<ContainerResponseDto> {
    const result = await this.queryBus.execute<
      GetContainerBySlugQuery,
      Result<ContainerEntity, ContainerDomainError>
    >(new GetContainerBySlugQuery(slug));

    if (result.isFail) throwHttpException(result.error);
    return ContainerResponseDto.from(result.value);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a container by ID' })
  @ApiOkResponse({ type: ContainerResponseDto })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContainerResponseDto> {
    const result = await this.queryBus.execute<
      GetContainerQuery,
      Result<GetContainerResult, ContainerDomainError>
    >(new GetContainerQuery(id, user.userId));

    if (result.isFail) throwHttpException(result.error);
    const { container, localizations } = result.value;
    return ContainerResponseDto.from(container, localizations);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update container metadata' })
  @ApiNoContentResponse()
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateContainerRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      UpdateContainerCommand,
      Result<void, ContainerDomainError>
    >(
      new UpdateContainerCommand(
        user.userId,
        id,
        dto.title,
        dto.description,
        dto.difficultyLevel,
        dto.coverImageMediaId,
        dto.visibility,
        dto.accessTier,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a container' })
  @ApiNoContentResponse()
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const result = await this.commandBus.execute<
      DeleteContainerCommand,
      Result<void, ContainerDomainError>
    >(new DeleteContainerCommand(user.userId, id));

    if (result.isFail) throwHttpException(result.error);
  }

  @Post(':id/draft')
  @ApiOperation({ summary: 'Create a new draft by copying the current published version' })
  @ApiCreatedResponse({ description: 'Returns the new draft version ID' })
  async createDraft(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ versionId: string }> {
    const result = await this.commandBus.execute<
      CreateDraftFromPublishedCommand,
      Result<{ versionId: string }, ContainerDomainError>
    >(new CreateDraftFromPublishedCommand(user.userId, id));

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Post(':id/localizations')
  @ApiOperation({ summary: 'Add a localization (translated title/description) for a container' })
  @ApiCreatedResponse({ type: ContainerLocalizationResponseDto })
  async createLocalization(
    @Param('id') id: string,
    @Body() dto: CreateLocalizationRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ localizationId: string }> {
    const result = await this.commandBus.execute<
      CreateLocalizationCommand,
      Result<{ localizationId: string }, ContainerDomainError>
    >(new CreateLocalizationCommand(user.userId, id, dto.languageCode, dto.title, dto.description));

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Patch(':id/localizations/:languageCode')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update an existing localization' })
  @ApiNoContentResponse()
  async updateLocalization(
    @Param('id') id: string,
    @Param('languageCode') languageCode: string,
    @Body() dto: UpdateLocalizationRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      UpdateLocalizationCommand,
      Result<void, ContainerDomainError>
    >(new UpdateLocalizationCommand(user.userId, id, languageCode, dto.title, dto.description));

    if (result.isFail) throwHttpException(result.error);
  }

  @Delete(':id/localizations/:languageCode')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a localization' })
  @ApiNoContentResponse()
  async deleteLocalization(
    @Param('id') id: string,
    @Param('languageCode') languageCode: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      DeleteLocalizationCommand,
      Result<void, ContainerDomainError>
    >(new DeleteLocalizationCommand(user.userId, id, languageCode));

    if (result.isFail) throwHttpException(result.error);
  }
}
