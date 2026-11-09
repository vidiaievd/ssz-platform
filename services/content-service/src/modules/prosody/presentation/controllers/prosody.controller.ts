import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
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
import { SuggestProsodyCommand } from '../../application/commands/suggest-prosody/suggest-prosody.command.js';
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
// marks as notation; the lexicon's word stresses join the student's layer in step 5b. A
// suggestion of phrase marks (step 5c.2) is the authoring view of what the agent proposes,
// never stored: the author saves it with the PUT.
const SUGGESTION_DESCRIPTION =
  'The authoring agent (ai-service `prosody_markup`, a language model) proposes group ends with ' +
  'their pitch and pause, phrase accents and linkings, source `ai`, over the stored layer: the ' +
  "teacher's word stresses stay, the stored phrase marks are replaced. Nothing is stored — the " +
  'answer is the authoring view of the proposal, saved with the PUT. Spends `ai.authoring` ' +
  "credits of the material's owner school, or of the author without one. Norwegian Bokmål only, " +
  'at most 1 500 words.';

const SAVE_BAD_REQUEST_DESCRIPTION =
  '`NOTATION_INVALID` / `LAYER_INVALID` with `issues` (kernel codes); `LAYER_MALFORMED` with ' +
  '`errors` (field paths); `SEND_NOTATION_OR_LAYER` — both or neither sent.';

const SAVE_CONFLICT_DESCRIPTION =
  '`LAYER_MODIFIED_ELSEWHERE`: `expectedUpdatedAt` no longer matches; `currentUpdatedAt` (null — ' +
  'the layer was removed) lets the editor offer to reload.';

const SUGGESTION_REFUSED_DESCRIPTION =
  '`SUGGESTION_REFUSED` with `reason`: `language_not_supported`, `no_words`, `too_long`, ' +
  '`not_available` (the agent is off or the plan has no `ai.authoring`), `pool_empty` (credits spent).';

const SUGGESTION_FAILED_DESCRIPTION =
  '`SUGGESTION_FAILED` with `errorCode` — the model or ai-service did not answer (`unreachable`).';

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
      'The notation or the layer covers the whole body markdown. The body alone, or a layer without marks, clears it.',
  })
  @ApiParam({ name: 'id', description: 'Lesson ID' })
  @ApiOkResponse({ type: ProsodyAuthoringResponseDto })
  @ApiBadRequestResponse({ description: SAVE_BAD_REQUEST_DESCRIPTION })
  @ApiConflictResponse({ description: SAVE_CONFLICT_DESCRIPTION })
  async setLessonProsody(
    @Param('id') lessonId: string,
    @Param('variantId') variantId: string,
    @Body() dto: SetProsodyRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProsodyAuthoringResponseDto> {
    return this.save(user.userId, { kind: 'lesson', lessonId, variantId }, dto);
  }

  @Post('lessons/:id/variants/:variantId/prosody/suggestion')
  @HttpCode(200)
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.LESSON })
  @ApiOperation({
    summary: 'Suggest the phrase marks of a TEXT lesson variant',
    description: SUGGESTION_DESCRIPTION,
  })
  @ApiParam({ name: 'id', description: 'Lesson ID' })
  @ApiOkResponse({ type: ProsodyAuthoringResponseDto })
  @ApiUnprocessableEntityResponse({ description: SUGGESTION_REFUSED_DESCRIPTION })
  @ApiBadGatewayResponse({ description: SUGGESTION_FAILED_DESCRIPTION })
  async suggestLessonProsody(
    @Param('id') lessonId: string,
    @Param('variantId') variantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProsodyAuthoringResponseDto> {
    return this.suggest(user.userId, { kind: 'lesson', lessonId, variantId });
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
  @ApiBadRequestResponse({ description: SAVE_BAD_REQUEST_DESCRIPTION })
  @ApiConflictResponse({ description: SAVE_CONFLICT_DESCRIPTION })
  @ApiUnprocessableEntityResponse({ description: '`NOT_READ_ALOUD`, `PROMPT_HAS_NO_TEXT`.' })
  async setExerciseProsody(
    @Param('id') exerciseId: string,
    @Param('promptId') promptId: string,
    @Body() dto: SetProsodyRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProsodyAuthoringResponseDto> {
    return this.save(user.userId, { kind: 'exercise', exerciseId, promptId }, dto);
  }

  @Post('exercises/:id/prompts/:promptId/prosody/suggestion')
  @HttpCode(200)
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.EXERCISE })
  @ApiOperation({
    summary: 'Suggest the phrase marks of one read_aloud prompt',
    description: `${SUGGESTION_DESCRIPTION} Against the draft passage when there is one.`,
  })
  @ApiOkResponse({ type: ProsodyAuthoringResponseDto })
  @ApiUnprocessableEntityResponse({
    description: `${SUGGESTION_REFUSED_DESCRIPTION} Also \`NOT_READ_ALOUD\`, \`PROMPT_HAS_NO_TEXT\`.`,
  })
  @ApiBadGatewayResponse({ description: SUGGESTION_FAILED_DESCRIPTION })
  async suggestExerciseProsody(
    @Param('id') exerciseId: string,
    @Param('promptId') promptId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProsodyAuthoringResponseDto> {
    return this.suggest(user.userId, { kind: 'exercise', exerciseId, promptId });
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
    dto: SetProsodyRequestDto,
  ): Promise<ProsodyAuthoringResponseDto> {
    if ((dto.notation === undefined) === (dto.layer === undefined))
      throw new BadRequestException({ message: 'SEND_NOTATION_OR_LAYER' });
    const input = dto.layer !== undefined ? { layer: dto.layer } : { notation: dto.notation! };
    const result = await this.commandBus.execute<
      SetProsodyCommand,
      Result<ProsodyAuthoringView, ProsodyError>
    >(new SetProsodyCommand(userId, owner, input, dto.expectedUpdatedAt));
    if (result.isFail) throwProsodyError(result.error);
    return ProsodyAuthoringResponseDto.from(result.value);
  }

  private async suggest(userId: string, owner: ProsodyOwner): Promise<ProsodyAuthoringResponseDto> {
    const result = await this.commandBus.execute<
      SuggestProsodyCommand,
      Result<ProsodyAuthoringView, ProsodyError>
    >(new SuggestProsodyCommand(userId, owner));
    if (result.isFail) throwProsodyError(result.error);
    return ProsodyAuthoringResponseDto.from(result.value);
  }
}
