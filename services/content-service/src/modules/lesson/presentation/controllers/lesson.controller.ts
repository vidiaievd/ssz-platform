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
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import type { Result } from '../../../../shared/kernel/result.js';
import type { PaginatedResult } from '../../../../shared/kernel/pagination.js';

// Commands — lessons
import { CreateLessonCommand } from '../../application/commands/create-lesson/create-lesson.command.js';
import type { CreateLessonResult } from '../../application/commands/create-lesson/create-lesson.handler.js';
import { UpdateLessonCommand } from '../../application/commands/update-lesson/update-lesson.command.js';
import { DeleteLessonCommand } from '../../application/commands/delete-lesson/delete-lesson.command.js';

// Commands — variants
import { CreateVariantCommand } from '../../application/commands/create-variant/create-variant.command.js';
import type { CreateVariantResult } from '../../application/commands/create-variant/create-variant.handler.js';
import { UpdateVariantCommand } from '../../application/commands/update-variant/update-variant.command.js';
import { PublishVariantCommand } from '../../application/commands/publish-variant/publish-variant.command.js';
import { DeleteVariantCommand } from '../../application/commands/delete-variant/delete-variant.command.js';

// Queries
import { GetLessonQuery } from '../../application/queries/get-lesson/get-lesson.query.js';
import { GetLessonsQuery } from '../../application/queries/get-lessons/get-lessons.query.js';
import { GetLessonBySlugQuery } from '../../application/queries/get-lesson-by-slug/get-lesson-by-slug.query.js';
import { GetLessonVariantsQuery } from '../../application/queries/get-lesson-variants/get-lesson-variants.query.js';
import { GetLessonVariantQuery } from '../../application/queries/get-lesson-variant/get-lesson-variant.query.js';
import { GetBestVariantQuery } from '../../application/queries/get-best-variant/get-best-variant.query.js';
import type { GetBestVariantResult } from '../../application/queries/get-best-variant/get-best-variant.handler.js';

// Domain types
import type { LessonDomainError } from '../../domain/exceptions/lesson-domain.exceptions.js';
import type { LessonEntity } from '../../domain/entities/lesson.entity.js';
import type { LessonContentVariantEntity } from '../../domain/entities/lesson-content-variant.entity.js';

// Request DTOs
import { CreateLessonRequestDto } from '../dto/requests/create-lesson.request.dto.js';
import { UpdateLessonRequestDto } from '../dto/requests/update-lesson.request.dto.js';
import { GetLessonsFilterRequestDto } from '../dto/requests/get-lessons-filter.request.dto.js';
import { CreateVariantRequestDto } from '../dto/requests/create-variant.request.dto.js';
import { UpdateVariantRequestDto } from '../dto/requests/update-variant.request.dto.js';
import { GetBestVariantRequestDto } from '../dto/requests/get-best-variant.request.dto.js';

// Response DTOs
import { LessonResponseDto } from '../dto/responses/lesson.response.dto.js';
import { LessonVariantResponseDto } from '../dto/responses/lesson-variant.response.dto.js';
import { BestVariantResponseDto } from '../dto/responses/best-variant.response.dto.js';
import { PaginatedResponseDto } from '../../../container/presentation/dto/responses/paginated.response.dto.js';

// Error mapper
import { throwHttpException } from '../utils/domain-error.mapper.js';

@ApiTags('Lessons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('lessons')
export class LessonController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  // ── Lesson CRUD ────────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create a new lesson' })
  @ApiCreatedResponse({ description: 'Returns the new lesson ID' })
  async createLesson(
    @Body() dto: CreateLessonRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ lessonId: string }> {
    const result = await this.commandBus.execute<
      CreateLessonCommand,
      Result<CreateLessonResult, LessonDomainError>
    >(
      new CreateLessonCommand(
        user.userId,
        dto.targetLanguage,
        dto.difficultyLevel,
        dto.title,
        dto.visibility,
        dto.description,
        dto.coverImageMediaId,
        dto.ownerSchoolId,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Get()
  @ApiOperation({ summary: 'List lessons with optional filters and pagination' })
  @ApiOkResponse({ type: PaginatedResponseDto })
  async findAll(
    @Query() filter: GetLessonsFilterRequestDto,
  ): Promise<PaginatedResponseDto<LessonResponseDto>> {
    const paged = await this.queryBus.execute<GetLessonsQuery, PaginatedResult<LessonEntity>>(
      new GetLessonsQuery({
        targetLanguage: filter.targetLanguage,
        difficultyLevel: filter.difficultyLevel,
        visibility: filter.visibility,
        ownerUserId: filter.ownerUserId,
        ownerSchoolId: filter.ownerSchoolId,
        search: filter.search,
        page: filter.page ?? 1,
        limit: filter.limit ?? 20,
      }),
    );

    return new PaginatedResponseDto({
      items: paged.items.map((l) => LessonResponseDto.from(l)),
      total: paged.total,
      page: paged.page,
      limit: paged.limit,
      totalPages: paged.totalPages,
    });
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get a published lesson by its URL slug' })
  @ApiOkResponse({ type: LessonResponseDto })
  async findBySlug(@Param('slug') slug: string): Promise<LessonResponseDto> {
    const result = await this.queryBus.execute<
      GetLessonBySlugQuery,
      Result<LessonEntity, LessonDomainError>
    >(new GetLessonBySlugQuery(slug));

    if (result.isFail) throwHttpException(result.error);
    return LessonResponseDto.from(result.value);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a lesson by ID' })
  @ApiOkResponse({ type: LessonResponseDto })
  async findOne(@Param('id') id: string): Promise<LessonResponseDto> {
    const result = await this.queryBus.execute<
      GetLessonQuery,
      Result<LessonEntity, LessonDomainError>
    >(new GetLessonQuery(id));

    if (result.isFail) throwHttpException(result.error);
    return LessonResponseDto.from(result.value);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update lesson metadata' })
  @ApiNoContentResponse()
  async updateLesson(
    @Param('id') id: string,
    @Body() dto: UpdateLessonRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      UpdateLessonCommand,
      Result<void, LessonDomainError>
    >(
      new UpdateLessonCommand(
        user.userId,
        id,
        dto.title,
        dto.description,
        dto.difficultyLevel,
        dto.coverImageMediaId,
        dto.visibility,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a lesson and all its variants' })
  @ApiNoContentResponse()
  async deleteLesson(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      DeleteLessonCommand,
      Result<void, LessonDomainError>
    >(new DeleteLessonCommand(user.userId, id));

    if (result.isFail) throwHttpException(result.error);
  }

  // ── Variant sub-resources ──────────────────────────────────────────────────

  @Post(':id/variants')
  @ApiOperation({ summary: 'Create a new content variant for a lesson' })
  @ApiCreatedResponse({ description: 'Returns the new variant ID' })
  async createVariant(
    @Param('id') lessonId: string,
    @Body() dto: CreateVariantRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ variantId: string }> {
    const result = await this.commandBus.execute<
      CreateVariantCommand,
      Result<CreateVariantResult, LessonDomainError>
    >(
      new CreateVariantCommand(
        user.userId,
        lessonId,
        dto.explanationLanguage,
        dto.minLevel,
        dto.maxLevel,
        dto.displayTitle,
        dto.bodyMarkdown,
        dto.displayDescription,
        dto.estimatedReadingMinutes,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Get(':id/variants')
  @ApiOperation({ summary: 'List all variants for a lesson' })
  @ApiOkResponse({ type: LessonVariantResponseDto, isArray: true })
  async findVariants(@Param('id') lessonId: string): Promise<LessonVariantResponseDto[]> {
    const result = await this.queryBus.execute<
      GetLessonVariantsQuery,
      Result<LessonContentVariantEntity[], LessonDomainError>
    >(new GetLessonVariantsQuery(lessonId));

    if (result.isFail) throwHttpException(result.error);
    return result.value.map((v) => LessonVariantResponseDto.from(v));
  }

  @Get(':id/variants/best')
  @ApiOperation({ summary: 'Select the best variant for a student based on their profile' })
  @ApiOkResponse({ type: BestVariantResponseDto })
  async findBestVariant(
    @Param('id') lessonId: string,
    @Query() dto: GetBestVariantRequestDto,
  ): Promise<BestVariantResponseDto> {
    const result = await this.queryBus.execute<
      GetBestVariantQuery,
      Result<GetBestVariantResult, LessonDomainError>
    >(
      new GetBestVariantQuery(
        lessonId,
        dto.studentNativeLanguage,
        dto.studentCurrentLevel,
        dto.studentKnownLanguages ?? [],
      ),
    );

    if (result.isFail) throwHttpException(result.error);
    return BestVariantResponseDto.from(result.value.variant, result.value.fallbackUsed);
  }

  @Get(':id/variants/:variantId')
  @ApiOperation({ summary: 'Get a single lesson variant by ID' })
  @ApiOkResponse({ type: LessonVariantResponseDto })
  @ApiParam({ name: 'id', type: String, description: 'Lesson ID' })
  async findVariant(@Param('variantId') variantId: string): Promise<LessonVariantResponseDto> {
    const result = await this.queryBus.execute<
      GetLessonVariantQuery,
      Result<LessonContentVariantEntity, LessonDomainError>
    >(new GetLessonVariantQuery(variantId));

    if (result.isFail) throwHttpException(result.error);
    return LessonVariantResponseDto.from(result.value);
  }

  @Patch(':id/variants/:variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update a content variant (allowed on both draft and published)' })
  @ApiNoContentResponse()
  @ApiParam({ name: 'id', type: String, description: 'Lesson ID' })
  async updateVariant(
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      UpdateVariantCommand,
      Result<void, LessonDomainError>
    >(
      new UpdateVariantCommand(
        user.userId,
        variantId,
        dto.displayTitle,
        dto.displayDescription,
        dto.bodyMarkdown,
        dto.estimatedReadingMinutes,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
  }

  @Post(':id/variants/:variantId/publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Publish a draft variant (DRAFT → PUBLISHED)' })
  @ApiNoContentResponse()
  @ApiParam({ name: 'id', type: String, description: 'Lesson ID' })
  async publishVariant(
    @Param('variantId') variantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      PublishVariantCommand,
      Result<void, LessonDomainError>
    >(new PublishVariantCommand(user.userId, variantId));

    if (result.isFail) throwHttpException(result.error);
  }

  @Delete(':id/variants/:variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Hard-delete a content variant' })
  @ApiNoContentResponse()
  @ApiParam({ name: 'id', type: String, description: 'Lesson ID' })
  async deleteVariant(
    @Param('variantId') variantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      DeleteVariantCommand,
      Result<void, LessonDomainError>
    >(new DeleteVariantCommand(user.userId, variantId));

    if (result.isFail) throwHttpException(result.error);
  }
}
