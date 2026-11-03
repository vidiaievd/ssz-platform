import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { VisibilityGuard } from '../../../../shared/access-control/presentation/guards/visibility.guard.js';
import { RequireAccess } from '../../../../shared/access-control/presentation/decorators/require-access.decorator.js';
import { AccessGrant } from '../../../../shared/access-control/presentation/decorators/access-grant.decorator.js';
import { AccessDeniedException } from '../../../../shared/access-control/presentation/exceptions/access-denied.exception.js';
import { isStaffGrant } from '../../../../shared/access-control/domain/services/visibility-checker.service.js';
import type { AccessDecision } from '../../../../shared/access-control/domain/types/access-decision.js';
import { TaggableEntityType } from '../../../../shared/access-control/domain/types/taggable-entity-type.js';
import type { Result } from '../../../../shared/kernel/result.js';
import type { ProsodyError } from '../../domain/prosody-error.js';
import type { ProsodyOwner } from '../../domain/prosody-owner.js';
import type { ProsodyAuthoringView } from '../../application/authoring-text.js';
import { GetLessonProsodyQuery } from '../../application/queries/get-lesson-prosody/get-lesson-prosody.query.js';
import type { LessonProsodyView } from '../../application/queries/get-lesson-prosody/get-lesson-prosody.handler.js';
import { GetExerciseProsodyQuery } from '../../application/queries/get-exercise-prosody/get-exercise-prosody.query.js';
import type { ExerciseProsodyView } from '../../application/queries/get-exercise-prosody/get-exercise-prosody.handler.js';
import { GetProsodyAuthoringQuery } from '../../application/queries/get-prosody-authoring/get-prosody-authoring.query.js';
import { SetProsodyCommand } from '../../application/commands/set-prosody/set-prosody.command.js';
import { SetProsodyRequestDto } from '../dto/set-prosody.request.dto.js';
import {
  ExerciseProsodyResponseDto,
  LessonProsodyResponseDto,
  ProsodyAuthoringResponseDto,
} from '../dto/prosody.response.dto.js';
import { throwProsodyError } from '../prosody-error.mapper.js';

// Intonation marks beside lesson bodies and read_aloud passages (plan 86, step 5). The
// student's layer is a request of its own, made when a prosody switch is turned on (§4a,
// decision 3) — never part of the lesson or exercise payload. Authors read and write the
// marks as notation; the lexicon's word stresses join the student's layer in step 5b.
@ApiTags('Prosody')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ProsodyController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  // ── Lessons (TEXT variants) ───────────────────────────────────────────────

  @Get('lessons/:id/variants/:variantId/prosody')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.LESSON })
  @ApiOperation({
    summary: "The reader's prosody layer of a TEXT lesson variant, per paragraph",
    description:
      'Anchors are local to each paragraph of the reader. Orphans and marks that no longer fit the body are left out.',
  })
  @ApiParam({ name: 'id', description: 'Lesson ID' })
  @ApiOkResponse({ type: LessonProsodyResponseDto })
  @ApiNotFoundResponse({ description: 'No such variant of this lesson.' })
  @ApiUnprocessableEntityResponse({ description: '`NOT_A_TEXT_LESSON`.' })
  async findLessonProsody(
    @Param('id') lessonId: string,
    @Param('variantId') variantId: string,
  ): Promise<LessonProsodyResponseDto> {
    const result = await this.queryBus.execute<
      GetLessonProsodyQuery,
      Result<LessonProsodyView, ProsodyError>
    >(new GetLessonProsodyQuery(lessonId, variantId));
    if (result.isFail) throwProsodyError(result.error);
    return LessonProsodyResponseDto.from(result.value);
  }

  @Get('lessons/:id/variants/:variantId/prosody/authoring')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.LESSON })
  @ApiOperation({
    summary: "The author's prosody layer of a TEXT lesson variant, as notation and layer",
  })
  @ApiParam({ name: 'id', description: 'Lesson ID' })
  @ApiOkResponse({ type: ProsodyAuthoringResponseDto })
  async findLessonProsodyAuthoring(
    @Param('id') lessonId: string,
    @Param('variantId') variantId: string,
  ): Promise<ProsodyAuthoringResponseDto> {
    return this.authoring({ kind: 'lesson', lessonId, variantId });
  }

  @Put('lessons/:id/variants/:variantId/prosody')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.LESSON })
  @ApiOperation({
    summary: 'Replace the prosody layer of a TEXT lesson variant',
    description:
      'The notation covers the whole body markdown. The body alone, without marks, clears the layer.',
  })
  @ApiParam({ name: 'id', description: 'Lesson ID' })
  @ApiOkResponse({ type: ProsodyAuthoringResponseDto })
  @ApiBadRequestResponse({ description: '`NOTATION_INVALID` / `LAYER_INVALID` with `issues`.' })
  async setLessonProsody(
    @Param('id') lessonId: string,
    @Param('variantId') variantId: string,
    @Body() dto: SetProsodyRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProsodyAuthoringResponseDto> {
    return this.save(user.userId, { kind: 'lesson', lessonId, variantId }, dto.notation);
  }

  // ── read_aloud exercises ──────────────────────────────────────────────────

  @Get('exercises/:id/prosody')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.EXERCISE })
  @ApiOperation({ summary: 'The prosody layer of every passage of a read_aloud exercise' })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: ['live', 'draft'],
    description:
      '`live` (default) is what students are served; `draft`, staff only, the unreleased edit.',
  })
  @ApiOkResponse({ type: ExerciseProsodyResponseDto })
  @ApiForbiddenResponse({ description: 'A learner asked for `scope=draft`.' })
  @ApiUnprocessableEntityResponse({ description: '`NOT_READ_ALOUD`.' })
  async findExerciseProsody(
    @Param('id') exerciseId: string,
    @AccessGrant() grant: AccessDecision,
    @Query('scope') scope?: string,
  ): Promise<ExerciseProsodyResponseDto> {
    if (scope === 'draft' && !isStaffGrant(grant))
      throw new AccessDeniedException('draft_is_staff_only');
    const result = await this.queryBus.execute<
      GetExerciseProsodyQuery,
      Result<ExerciseProsodyView, ProsodyError>
    >(new GetExerciseProsodyQuery(exerciseId, scope === 'draft' ? 'draft' : 'live'));
    if (result.isFail) throwProsodyError(result.error);
    return ExerciseProsodyResponseDto.from(result.value);
  }

  @Get('exercises/:id/prompts/:promptId/prosody/authoring')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.EXERCISE })
  @ApiOperation({
    summary:
      "The author's prosody layer of one read_aloud prompt, against the document the builder edits",
  })
  @ApiOkResponse({ type: ProsodyAuthoringResponseDto })
  async findExerciseProsodyAuthoring(
    @Param('id') exerciseId: string,
    @Param('promptId') promptId: string,
  ): Promise<ProsodyAuthoringResponseDto> {
    return this.authoring({ kind: 'exercise', exerciseId, promptId });
  }

  @Put('exercises/:id/prompts/:promptId/prosody')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.EXERCISE })
  @ApiOperation({
    summary: 'Replace the prosody layer of one read_aloud prompt',
    description:
      'Written against the draft passage when there is one. The row is shared by the draft and the live document; each re-anchors it on read.',
  })
  @ApiOkResponse({ type: ProsodyAuthoringResponseDto })
  @ApiBadRequestResponse({ description: '`NOTATION_INVALID` / `LAYER_INVALID` with `issues`.' })
  @ApiUnprocessableEntityResponse({ description: '`NOT_READ_ALOUD`, `PROMPT_HAS_NO_TEXT`.' })
  async setExerciseProsody(
    @Param('id') exerciseId: string,
    @Param('promptId') promptId: string,
    @Body() dto: SetProsodyRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProsodyAuthoringResponseDto> {
    return this.save(user.userId, { kind: 'exercise', exerciseId, promptId }, dto.notation);
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async authoring(owner: ProsodyOwner): Promise<ProsodyAuthoringResponseDto> {
    const result = await this.queryBus.execute<
      GetProsodyAuthoringQuery,
      Result<ProsodyAuthoringView, ProsodyError>
    >(new GetProsodyAuthoringQuery(owner));
    if (result.isFail) throwProsodyError(result.error);
    return ProsodyAuthoringResponseDto.from(result.value);
  }

  private async save(
    userId: string,
    owner: ProsodyOwner,
    notation: string,
  ): Promise<ProsodyAuthoringResponseDto> {
    const result = await this.commandBus.execute<
      SetProsodyCommand,
      Result<ProsodyAuthoringView, ProsodyError>
    >(new SetProsodyCommand(userId, owner, notation));
    if (result.isFail) throwProsodyError(result.error);
    return ProsodyAuthoringResponseDto.from(result.value);
  }
}
