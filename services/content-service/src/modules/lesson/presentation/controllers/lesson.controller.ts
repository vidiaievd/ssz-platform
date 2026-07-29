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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard.js';
import { VisibilityGuard } from '../../../../shared/access-control/presentation/guards/visibility.guard.js';
import { RequireAccess } from '../../../../shared/access-control/presentation/decorators/require-access.decorator.js';
import { TaggableEntityType } from '../../../../shared/access-control/domain/types/taggable-entity-type.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import type { Result } from '../../../../shared/kernel/result.js';
import type { PaginatedResult } from '../../../../shared/discovery/domain/types/pagination.js';

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
import { SetVideoCuesCommand } from '../../application/commands/set-video-cues/set-video-cues.command.js';
import { SetVideoQuestionCommand } from '../../application/commands/set-video-question/set-video-question.command.js';
import type { SetVideoQuestionResult } from '../../application/commands/set-video-question/set-video-question.handler.js';
import { ClearVideoQuestionCommand } from '../../application/commands/clear-video-question/clear-video-question.command.js';
import { SetListeningStagesCommand } from '../../application/commands/set-listening-stages/set-listening-stages.command.js';
import { SetParagraphTranslationsCommand } from '../../application/commands/set-paragraph-translations/set-paragraph-translations.command.js';
import { MarkGlossaryWordCommand } from '../../application/commands/mark-glossary-word/mark-glossary-word.command.js';
import type { MarkGlossaryWordResult } from '../../application/commands/mark-glossary-word/mark-glossary-word.handler.js';
import { UnmarkGlossaryWordCommand } from '../../application/commands/unmark-glossary-word/unmark-glossary-word.command.js';
import { CreateTextSpanCommand } from '../../application/commands/create-text-span/create-text-span.command.js';
import type { CreateTextSpanResult } from '../../application/commands/create-text-span/create-text-span.handler.js';
import { UpdateTextSpanCommand } from '../../application/commands/update-text-span/update-text-span.command.js';
import type { UpdateTextSpanResult } from '../../application/commands/update-text-span/update-text-span.handler.js';
import { DeleteTextSpanCommand } from '../../application/commands/delete-text-span/delete-text-span.command.js';

// Queries
import { GetLessonQuery } from '../../application/queries/get-lesson/get-lesson.query.js';
import { GetLessonsQuery } from '../../application/queries/get-lessons/get-lessons.query.js';
import { GetLessonBySlugQuery } from '../../application/queries/get-lesson-by-slug/get-lesson-by-slug.query.js';
import { GetLessonVariantsQuery } from '../../application/queries/get-lesson-variants/get-lesson-variants.query.js';
import { GetLessonVariantQuery } from '../../application/queries/get-lesson-variant/get-lesson-variant.query.js';
import { GetBestVariantQuery } from '../../application/queries/get-best-variant/get-best-variant.query.js';
import type { GetBestVariantResult } from '../../application/queries/get-best-variant/get-best-variant.handler.js';
import { GetVideoCuesQuery } from '../../application/queries/get-video-cues/get-video-cues.query.js';
import { GetVideoQuestionQuery } from '../../application/queries/get-video-question/get-video-question.query.js';
import { GetListeningStagesQuery } from '../../application/queries/get-listening-stages/get-listening-stages.query.js';
import { GetTextParagraphsQuery } from '../../application/queries/get-text-paragraphs/get-text-paragraphs.query.js';
import type { TextParagraphResult } from '../../application/queries/get-text-paragraphs/get-text-paragraphs.handler.js';
import { GetGlossaryMarksQuery } from '../../application/queries/get-glossary-marks/get-glossary-marks.query.js';
import { GetTextSpansQuery } from '../../application/queries/get-text-spans/get-text-spans.query.js';
import type { TextSpanView } from '../../application/queries/get-text-spans/get-text-spans.handler.js';
import type { GlossaryMarkRow } from '../../domain/repositories/lesson-glossary-mark.repository.interface.js';
import { GetLessonReaderContentQuery } from '../../application/queries/get-lesson-reader-content/get-lesson-reader-content.query.js';
import type { LessonReaderContent } from '../../application/queries/get-lesson-reader-content/get-lesson-reader-content.handler.js';

// Domain types
import type { LessonDomainError } from '../../domain/exceptions/lesson-domain.exceptions.js';
import type { LessonEntity } from '../../domain/entities/lesson.entity.js';
import type { LessonContentVariantEntity } from '../../domain/entities/lesson-content-variant.entity.js';
import type { LessonVideoCueEntity } from '../../domain/entities/lesson-video-cue.entity.js';
import type { LessonVideoQuestionEntity } from '../../domain/entities/lesson-video-question.entity.js';
import type { LessonListeningStageEntity } from '../../domain/entities/lesson-listening-stage.entity.js';

// Request DTOs
import { CreateLessonRequestDto } from '../dto/requests/create-lesson.request.dto.js';
import { UpdateLessonRequestDto } from '../dto/requests/update-lesson.request.dto.js';
import { LessonListQueryDto } from '../dto/requests/lesson-list-query.dto.js';
import { CreateVariantRequestDto } from '../dto/requests/create-variant.request.dto.js';
import { UpdateVariantRequestDto } from '../dto/requests/update-variant.request.dto.js';
import { GetBestVariantRequestDto } from '../dto/requests/get-best-variant.request.dto.js';
import { LessonVariantsQueryDto } from '../dto/requests/lesson-variants-query.dto.js';
import { SetVideoCuesRequestDto } from '../dto/requests/set-video-cues.request.dto.js';
import { SetVideoQuestionRequestDto } from '../dto/requests/set-video-question.request.dto.js';
import { SetListeningStagesRequestDto } from '../dto/requests/set-listening-stages.request.dto.js';
import { SetParagraphTranslationsRequestDto } from '../dto/requests/set-paragraph-translations.request.dto.js';
import { MarkGlossaryWordRequestDto } from '../dto/requests/mark-glossary-word.request.dto.js';

// Response DTOs
import { LessonResponseDto } from '../dto/responses/lesson.response.dto.js';
import { LessonVariantResponseDto } from '../dto/responses/lesson-variant.response.dto.js';
import { BestVariantResponseDto } from '../dto/responses/best-variant.response.dto.js';
import { LessonVideoCueResponseDto } from '../dto/responses/lesson-video-cue.response.dto.js';
import { LessonVideoQuestionResponseDto } from '../dto/responses/lesson-video-question.response.dto.js';
import { LessonListeningStageResponseDto } from '../dto/responses/lesson-listening-stage.response.dto.js';
import { TextParagraphResponseDto } from '../dto/responses/text-paragraph.response.dto.js';
import { GlossaryMarkResponseDto } from '../dto/responses/glossary-mark.response.dto.js';
import { CreateTextSpanRequestDto } from '../dto/requests/create-text-span.request.dto.js';
import { UpdateTextSpanRequestDto } from '../dto/requests/update-text-span.request.dto.js';
import { LessonTextSpanResponseDto } from '../dto/responses/lesson-text-span.response.dto.js';
import { LessonReaderContentResponseDto } from '../dto/responses/lesson-reader-content.response.dto.js';
import { PaginatedResponseDto } from '../../../../shared/discovery/presentation/dto/paginated-response.dto.js';
import { ApiPaginatedResponse } from '../../../../shared/discovery/presentation/decorators/api-paginated-response.decorator.js';

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
        dto.kind,
        dto.liveStartsAt,
        dto.liveDurationMinutes,
        dto.liveJoinUrl,
        dto.liveCapacity,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Get()
  @ApiOperation({ summary: 'List lessons with optional filters and pagination' })
  @ApiPaginatedResponse(LessonResponseDto)
  async findAll(
    @Query() dto: LessonListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedResponseDto<LessonResponseDto>> {
    const paged = await this.queryBus.execute<GetLessonsQuery, PaginatedResult<LessonEntity>>(
      new GetLessonsQuery(dto, user),
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
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.LESSON })
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

  @Get(':id/reader')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.LESSON })
  @ApiOperation({
    summary:
      'Kind-aware reader payload for a lesson (TEXT: paragraphs+glossary, VIDEO: cues+glossary, ' +
      'AUDIO: transcript+listening stages, LIVE: schedule stub) — single round trip for the reader page',
  })
  @ApiOkResponse({ type: LessonReaderContentResponseDto })
  async getReaderContent(
    @Param('id') id: string,
    @Query() dto: GetBestVariantRequestDto,
  ): Promise<LessonReaderContentResponseDto> {
    const result = await this.queryBus.execute<
      GetLessonReaderContentQuery,
      Result<LessonReaderContent, LessonDomainError>
    >(
      new GetLessonReaderContentQuery(
        id,
        dto.studentNativeLanguage,
        dto.studentCurrentLevel,
        dto.studentKnownLanguages ?? [],
      ),
    );

    if (result.isFail) throwHttpException(result.error);
    return LessonReaderContentResponseDto.from(result.value);
  }

  @Patch(':id')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.LESSON })
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
        dto.liveStartsAt,
        dto.liveDurationMinutes,
        dto.liveJoinUrl,
        dto.liveCapacity,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
  }

  @Delete(':id')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.LESSON })
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
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.LESSON })
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
        dto.transcript,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Get(':id/variants')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.LESSON })
  @ApiOperation({ summary: 'List variants for a lesson with optional filters and pagination' })
  @ApiPaginatedResponse(LessonVariantResponseDto)
  async findVariants(
    @Param('id') lessonId: string,
    @Query() dto: LessonVariantsQueryDto,
  ): Promise<PaginatedResponseDto<LessonVariantResponseDto>> {
    const paged = await this.queryBus.execute<
      GetLessonVariantsQuery,
      PaginatedResult<LessonContentVariantEntity>
    >(new GetLessonVariantsQuery(lessonId, dto));

    return new PaginatedResponseDto({
      items: paged.items.map((v) => LessonVariantResponseDto.from(v)),
      total: paged.total,
      page: paged.page,
      limit: paged.limit,
      totalPages: paged.totalPages,
    });
  }

  @Get(':id/variants/best')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.LESSON })
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
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.LESSON })
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
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.LESSON })
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
        dto.transcript,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
  }

  @Post(':id/variants/:variantId/publish')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.LESSON })
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
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.LESSON })
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

  // ── Video cues sub-resource (kind=VIDEO variants only) ─────────────────────

  @Post(':id/variants/:variantId/cues')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.LESSON })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Replace all transcript cues for a VIDEO lesson variant' })
  @ApiNoContentResponse()
  @ApiParam({ name: 'id', type: String, description: 'Lesson ID' })
  async setVideoCues(
    @Param('variantId') variantId: string,
    @Body() dto: SetVideoCuesRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      SetVideoCuesCommand,
      Result<void, LessonDomainError>
    >(new SetVideoCuesCommand(user.userId, variantId, dto.cues));

    if (result.isFail) throwHttpException(result.error);
  }

  @Get(':id/variants/:variantId/cues')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.LESSON })
  @ApiOperation({ summary: 'List transcript cues for a VIDEO lesson variant, ordered by position' })
  @ApiOkResponse({ type: [LessonVideoCueResponseDto] })
  @ApiParam({ name: 'id', type: String, description: 'Lesson ID' })
  async findVideoCues(@Param('variantId') variantId: string): Promise<LessonVideoCueResponseDto[]> {
    const cues = await this.queryBus.execute<GetVideoCuesQuery, LessonVideoCueEntity[]>(
      new GetVideoCuesQuery(variantId),
    );

    return cues.map((c) => LessonVideoCueResponseDto.from(c));
  }

  @Put(':id/variants/:variantId/comprehension-question')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.LESSON })
  @ApiOperation({
    summary: 'Link (or replace) the comprehension-check exercise for a VIDEO lesson variant',
  })
  @ApiOkResponse({ description: 'Returns the link ID' })
  @ApiParam({ name: 'id', type: String, description: 'Lesson ID' })
  async setVideoQuestion(
    @Param('variantId') variantId: string,
    @Body() dto: SetVideoQuestionRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ questionId: string }> {
    const result = await this.commandBus.execute<
      SetVideoQuestionCommand,
      Result<SetVideoQuestionResult, LessonDomainError>
    >(new SetVideoQuestionCommand(user.userId, variantId, dto.exerciseId));

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Delete(':id/variants/:variantId/comprehension-question')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.LESSON })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unlink the comprehension-check exercise from a VIDEO lesson variant' })
  @ApiNoContentResponse()
  @ApiParam({ name: 'id', type: String, description: 'Lesson ID' })
  async clearVideoQuestion(
    @Param('variantId') variantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      ClearVideoQuestionCommand,
      Result<void, LessonDomainError>
    >(new ClearVideoQuestionCommand(user.userId, variantId));

    if (result.isFail) throwHttpException(result.error);
  }

  @Get(':id/variants/:variantId/comprehension-question')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.LESSON })
  @ApiOperation({
    summary: 'Get the comprehension-check exercise link for a VIDEO lesson variant, if any',
  })
  @ApiOkResponse({ type: LessonVideoQuestionResponseDto })
  @ApiParam({ name: 'id', type: String, description: 'Lesson ID' })
  async findVideoQuestion(
    @Param('variantId') variantId: string,
  ): Promise<LessonVideoQuestionResponseDto | null> {
    const question = await this.queryBus.execute<
      GetVideoQuestionQuery,
      LessonVideoQuestionEntity | null
    >(new GetVideoQuestionQuery(variantId));

    return question ? LessonVideoQuestionResponseDto.from(question) : null;
  }

  // ── Listening stages sub-resource (kind=AUDIO variants only) ───────────────

  @Post(':id/variants/:variantId/listening-stages')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.LESSON })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Replace all staged gap-fill/comprehension exercises for an AUDIO lesson variant',
  })
  @ApiNoContentResponse()
  @ApiParam({ name: 'id', type: String, description: 'Lesson ID' })
  async setListeningStages(
    @Param('variantId') variantId: string,
    @Body() dto: SetListeningStagesRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      SetListeningStagesCommand,
      Result<void, LessonDomainError>
    >(new SetListeningStagesCommand(user.userId, variantId, dto.stages));

    if (result.isFail) throwHttpException(result.error);
  }

  @Get(':id/variants/:variantId/listening-stages')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.LESSON })
  @ApiOperation({ summary: 'List staged gap-fill/comprehension exercises, ordered by position' })
  @ApiOkResponse({ type: [LessonListeningStageResponseDto] })
  @ApiParam({ name: 'id', type: String, description: 'Lesson ID' })
  async findListeningStages(
    @Param('variantId') variantId: string,
  ): Promise<LessonListeningStageResponseDto[]> {
    const stages = await this.queryBus.execute<
      GetListeningStagesQuery,
      LessonListeningStageEntity[]
    >(new GetListeningStagesQuery(variantId));

    return stages.map((s) => LessonListeningStageResponseDto.from(s));
  }

  // ── Bilingual paragraph translations (kind=TEXT variants only) ─────────────

  @Get(':id/variants/:variantId/paragraphs')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.LESSON })
  @ApiOperation({ summary: 'Get body_markdown split into paragraphs with aligned translations' })
  @ApiOkResponse({ type: [TextParagraphResponseDto] })
  @ApiParam({ name: 'id', type: String, description: 'Lesson ID' })
  async findTextParagraphs(
    @Param('variantId') variantId: string,
  ): Promise<TextParagraphResponseDto[]> {
    const result = await this.queryBus.execute<
      GetTextParagraphsQuery,
      Result<TextParagraphResult[], LessonDomainError>
    >(new GetTextParagraphsQuery(variantId));

    if (result.isFail) throwHttpException(result.error);
    return result.value.map((p) => TextParagraphResponseDto.from(p));
  }

  @Post(':id/variants/:variantId/paragraphs')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.LESSON })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Replace paragraph translations for a TEXT lesson variant' })
  @ApiNoContentResponse()
  @ApiParam({ name: 'id', type: String, description: 'Lesson ID' })
  async setParagraphTranslations(
    @Param('variantId') variantId: string,
    @Body() dto: SetParagraphTranslationsRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      SetParagraphTranslationsCommand,
      Result<void, LessonDomainError>
    >(new SetParagraphTranslationsCommand(user.userId, variantId, dto.translations));

    if (result.isFail) throwHttpException(result.error);
  }

  // ── Glossary marks (kind=TEXT or VIDEO variants only) ──────────────────────

  @Post(':id/variants/:variantId/glossary-marks')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.LESSON })
  @ApiOperation({
    summary:
      'Mark a vocabulary item as introduced by this lesson variant; syncs to every module glossary containing the lesson',
  })
  @ApiCreatedResponse({ type: GlossaryMarkResponseDto })
  @ApiParam({ name: 'id', type: String, description: 'Lesson ID' })
  async markGlossaryWord(
    @Param('variantId') variantId: string,
    @Body() dto: MarkGlossaryWordRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GlossaryMarkResponseDto> {
    const result = await this.commandBus.execute<
      MarkGlossaryWordCommand,
      Result<MarkGlossaryWordResult, LessonDomainError>
    >(new MarkGlossaryWordCommand(user.userId, variantId, dto.vocabularyItemId));

    if (result.isFail) throwHttpException(result.error);
    return GlossaryMarkResponseDto.from(result.value.mark);
  }

  @Get(':id/variants/:variantId/glossary-marks')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.LESSON })
  @ApiOperation({ summary: 'List glossary marks for a lesson variant' })
  @ApiOkResponse({ type: [GlossaryMarkResponseDto] })
  @ApiParam({ name: 'id', type: String, description: 'Lesson ID' })
  async findGlossaryMarks(
    @Param('variantId') variantId: string,
  ): Promise<GlossaryMarkResponseDto[]> {
    const marks = await this.queryBus.execute<GetGlossaryMarksQuery, GlossaryMarkRow[]>(
      new GetGlossaryMarksQuery(variantId),
    );

    return marks.map((m) => GlossaryMarkResponseDto.from(m));
  }

  @Delete(':id/variants/:variantId/glossary-marks/:vocabularyItemId')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.LESSON })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      "Remove a vocabulary item from this variant's glossary; cascades to its text spans, leaves the module glossary alone",
  })
  @ApiNoContentResponse()
  @ApiParam({ name: 'id', type: String, description: 'Lesson ID' })
  async unmarkGlossaryWord(
    @Param('variantId') variantId: string,
    @Param('vocabularyItemId') vocabularyItemId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      UnmarkGlossaryWordCommand,
      Result<void, LessonDomainError>
    >(new UnmarkGlossaryWordCommand(user.userId, variantId, vocabularyItemId));

    if (result.isFail) throwHttpException(result.error);
  }

  // ── Text spans: lexis / grammar / chunks (kind=TEXT variants only) ─────────

  @Get(':id/variants/:variantId/spans')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.LESSON })
  @ApiOperation({
    summary: 'List positional annotations for a TEXT lesson variant',
    description:
      'Broken spans — those whose text snapshot no longer matches the body, or whose referent is gone — are omitted unless includeBroken=true, which authoring surfaces use to offer a re-anchor.',
  })
  @ApiOkResponse({ type: [LessonTextSpanResponseDto] })
  @ApiParam({ name: 'id', type: String, description: 'Lesson ID' })
  @ApiQuery({ name: 'includeBroken', type: Boolean, required: false })
  async findTextSpans(
    @Param('variantId') variantId: string,
    @Query('includeBroken') includeBroken?: string,
  ): Promise<LessonTextSpanResponseDto[]> {
    const result = await this.queryBus.execute<
      GetTextSpansQuery,
      Result<TextSpanView[], LessonDomainError>
    >(new GetTextSpansQuery(variantId, includeBroken === 'true'));

    if (result.isFail) throwHttpException(result.error);
    return result.value.map((view) => LessonTextSpanResponseDto.from(view));
  }

  @Post(':id/variants/:variantId/spans')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.LESSON })
  @ApiOperation({
    summary: 'Annotate a stretch of a TEXT variant as vocabulary, grammar or a chunk',
    description:
      'The text snapshot is derived from the current body, not supplied by the caller. Creating a vocab span also marks the word in this variant’s glossary and syncs it to every containing module.',
  })
  @ApiCreatedResponse({ type: LessonTextSpanResponseDto })
  @ApiParam({ name: 'id', type: String, description: 'Lesson ID' })
  async createTextSpan(
    @Param('variantId') variantId: string,
    @Body() dto: CreateTextSpanRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LessonTextSpanResponseDto> {
    const result = await this.commandBus.execute<
      CreateTextSpanCommand,
      Result<CreateTextSpanResult, LessonDomainError>
    >(
      new CreateTextSpanCommand(
        user.userId,
        variantId,
        dto.paragraphIndex,
        dto.charStart,
        dto.charEnd,
        dto.kind,
        dto.refId ?? null,
        dto.note ?? null,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
    return LessonTextSpanResponseDto.fromEntity(result.value.span);
  }

  @Patch(':id/variants/:variantId/spans/:spanId')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.LESSON })
  @ApiOperation({
    summary: 'Re-anchor a span or edit its note',
    description:
      'Offsets move together and re-derive the snapshot. kind and refId are immutable — re-pointing an annotation is a delete plus a create.',
  })
  @ApiOkResponse({ type: LessonTextSpanResponseDto })
  @ApiParam({ name: 'id', type: String, description: 'Lesson ID' })
  async updateTextSpan(
    @Param('variantId') variantId: string,
    @Param('spanId') spanId: string,
    @Body() dto: UpdateTextSpanRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LessonTextSpanResponseDto> {
    const anchor =
      dto.paragraphIndex !== undefined && dto.charStart !== undefined && dto.charEnd !== undefined
        ? { paragraphIndex: dto.paragraphIndex, charStart: dto.charStart, charEnd: dto.charEnd }
        : undefined;

    const result = await this.commandBus.execute<
      UpdateTextSpanCommand,
      Result<UpdateTextSpanResult, LessonDomainError>
    >(new UpdateTextSpanCommand(user.userId, variantId, spanId, anchor, dto.note));

    if (result.isFail) throwHttpException(result.error);
    return LessonTextSpanResponseDto.fromEntity(result.value.span);
  }

  @Delete(':id/variants/:variantId/spans/:spanId')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.LESSON })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a span. Idempotent; leaves the vocabulary glossary mark in place',
  })
  @ApiNoContentResponse()
  @ApiParam({ name: 'id', type: String, description: 'Lesson ID' })
  async deleteTextSpan(
    @Param('variantId') variantId: string,
    @Param('spanId') spanId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      DeleteTextSpanCommand,
      Result<void, LessonDomainError>
    >(new DeleteTextSpanCommand(user.userId, variantId, spanId));

    if (result.isFail) throwHttpException(result.error);
  }
}
