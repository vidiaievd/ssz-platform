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
import { VisibilityGuard } from '../../../../shared/access-control/presentation/guards/visibility.guard.js';
import { RequireAccess } from '../../../../shared/access-control/presentation/decorators/require-access.decorator.js';
import { TaggableEntityType } from '../../../../shared/access-control/domain/types/taggable-entity-type.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import type { Result } from '../../../../shared/kernel/result.js';
import type { PaginatedResult } from '../../../../shared/discovery/domain/types/pagination.js';

// Commands
import { CreateExerciseCommand } from '../../application/commands/create-exercise/create-exercise.command.js';
import type { CreateExerciseResult } from '../../application/commands/create-exercise/create-exercise.handler.js';
import { UpdateExerciseCommand } from '../../application/commands/update-exercise/update-exercise.command.js';
import { DeleteExerciseCommand } from '../../application/commands/delete-exercise/delete-exercise.command.js';
import { UpsertExerciseInstructionCommand } from '../../application/commands/upsert-instruction/upsert-instruction.command.js';
import type { UpsertInstructionResult } from '../../application/commands/upsert-instruction/upsert-instruction.handler.js';
import { DeleteExerciseInstructionCommand } from '../../application/commands/delete-instruction/delete-instruction.command.js';

// Queries
import { GetExercisesQuery } from '../../application/queries/get-exercises/get-exercises.query.js';
import { GetExerciseQuery } from '../../application/queries/get-exercise/get-exercise.query.js';
import { GetExerciseForDisplayQuery } from '../../application/queries/get-exercise-for-display/get-exercise-for-display.query.js';
import { GetExerciseWithAnswersQuery } from '../../application/queries/get-exercise-with-answers/get-exercise-with-answers.query.js';
import { GetExerciseInstructionsQuery } from '../../application/queries/get-exercise-instructions/get-exercise-instructions.query.js';

// Domain types
import type { ExerciseDomainError } from '../../domain/exceptions/exercise-domain.exceptions.js';
import type { ExerciseTemplateDomainError } from '../../../exercise-template/domain/exceptions/exercise-template-domain.exceptions.js';
import type { ExerciseEntity } from '../../domain/entities/exercise.entity.js';
import type { ExerciseInstructionEntity } from '../../domain/entities/exercise-instruction.entity.js';

// Request DTOs
import { CreateExerciseRequestDto } from '../dto/requests/create-exercise.request.dto.js';
import { UpdateExerciseRequestDto } from '../dto/requests/update-exercise.request.dto.js';
import { ExerciseListQueryDto } from '../dto/requests/exercise-list-query.dto.js';
import { UpsertExerciseInstructionRequestDto } from '../dto/requests/upsert-instruction.request.dto.js';

// Response DTOs
import {
  ExerciseResponseDto,
  ExerciseWithAnswersResponseDto,
} from '../dto/responses/exercise.response.dto.js';
import { ExerciseInstructionResponseDto } from '../dto/responses/exercise-instruction.response.dto.js';
import { PaginatedResponseDto } from '../../../../shared/discovery/presentation/dto/paginated-response.dto.js';
import { ApiPaginatedResponse } from '../../../../shared/discovery/presentation/decorators/api-paginated-response.decorator.js';

// Error mapper
import { throwHttpException } from '../utils/domain-error.mapper.js';

type ExerciseError = ExerciseDomainError | ExerciseTemplateDomainError;

@ApiTags('Exercises')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('exercises')
export class ExerciseController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  // ── Exercise CRUD ──────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create a new exercise' })
  @ApiCreatedResponse({ description: 'Returns the new exercise ID' })
  async create(
    @Body() dto: CreateExerciseRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ exerciseId: string }> {
    const result = await this.commandBus.execute<
      CreateExerciseCommand,
      Result<CreateExerciseResult, ExerciseError>
    >(
      new CreateExerciseCommand(
        user.userId,
        dto.exerciseTemplateId,
        dto.targetLanguage,
        dto.difficultyLevel,
        dto.content,
        dto.expectedAnswers,
        dto.visibility,
        dto.answerCheckSettings,
        dto.ownerSchoolId,
        dto.estimatedDurationSeconds,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Get()
  @ApiOperation({ summary: 'List exercises with optional filters' })
  @ApiPaginatedResponse(ExerciseResponseDto)
  async findAll(
    @Query() dto: ExerciseListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedResponseDto<ExerciseResponseDto>> {
    const paged = await this.queryBus.execute<GetExercisesQuery, PaginatedResult<ExerciseEntity>>(
      new GetExercisesQuery(dto, user),
    );

    return new PaginatedResponseDto({
      items: paged.items.map((e) => ExerciseResponseDto.from(e)),
      total: paged.total,
      page: paged.page,
      limit: paged.limit,
      totalPages: paged.totalPages,
    });
  }

  @Get(':id')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.EXERCISE })
  @ApiOperation({ summary: 'Get an exercise by ID (no instructions)' })
  @ApiOkResponse({ type: ExerciseResponseDto })
  async findOne(@Param('id') id: string): Promise<ExerciseResponseDto> {
    const result = await this.queryBus.execute<
      GetExerciseQuery,
      Result<ExerciseEntity, ExerciseDomainError>
    >(new GetExerciseQuery(id));

    if (result.isFail) throwHttpException(result.error);
    return ExerciseResponseDto.from(result.value);
  }

  @Get(':id/display')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.EXERCISE })
  @ApiOperation({
    summary: 'Get an exercise with instructions for student display (answers omitted)',
  })
  @ApiOkResponse({ type: ExerciseResponseDto })
  async findForDisplay(
    @Param('id') id: string,
    @Query('lang') preferredInstructionLanguage?: string,
  ): Promise<ExerciseResponseDto> {
    const result = await this.queryBus.execute<
      GetExerciseForDisplayQuery,
      Result<ExerciseEntity, ExerciseDomainError>
    >(new GetExerciseForDisplayQuery(id, preferredInstructionLanguage));

    if (result.isFail) throwHttpException(result.error);
    return ExerciseResponseDto.from(result.value);
  }

  @Get(':id/answers')
  // TODO(block-5-followup): gate with InternalAuthGuard once implemented.
  // Currently protected only by JwtAuthGuard — acceptable for dev/staging.
  @ApiOperation({
    summary: 'Get an exercise with instructions and expected answers (owner/engine)',
  })
  @ApiOkResponse({ type: ExerciseWithAnswersResponseDto })
  async findWithAnswers(@Param('id') id: string): Promise<ExerciseWithAnswersResponseDto> {
    const result = await this.queryBus.execute<
      GetExerciseWithAnswersQuery,
      Result<ExerciseEntity, ExerciseDomainError>
    >(new GetExerciseWithAnswersQuery(id));

    if (result.isFail) throwHttpException(result.error);
    return ExerciseWithAnswersResponseDto.fromWithAnswers(result.value);
  }

  @Patch(':id')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.EXERCISE })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update exercise metadata, content or answers' })
  @ApiNoContentResponse()
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateExerciseRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      UpdateExerciseCommand,
      Result<void, ExerciseDomainError>
    >(
      new UpdateExerciseCommand(
        user.userId,
        id,
        dto.difficultyLevel,
        dto.content,
        dto.expectedAnswers,
        dto.answerCheckSettings,
        dto.visibility,
        dto.estimatedDurationSeconds,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
  }

  @Delete(':id')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.EXERCISE })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an exercise' })
  @ApiNoContentResponse()
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const result = await this.commandBus.execute<
      DeleteExerciseCommand,
      Result<void, ExerciseDomainError>
    >(new DeleteExerciseCommand(user.userId, id));

    if (result.isFail) throwHttpException(result.error);
  }

  // ── Instructions sub-resource ──────────────────────────────────────────────

  @Get(':id/instructions')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.EXERCISE })
  @ApiOperation({ summary: 'List all instructions for an exercise' })
  @ApiOkResponse({ type: ExerciseInstructionResponseDto, isArray: true })
  async findInstructions(@Param('id') id: string): Promise<ExerciseInstructionResponseDto[]> {
    const result = await this.queryBus.execute<
      GetExerciseInstructionsQuery,
      Result<ExerciseInstructionEntity[], ExerciseDomainError>
    >(new GetExerciseInstructionsQuery(id));

    if (result.isFail) throwHttpException(result.error);
    return result.value.map((i) => ExerciseInstructionResponseDto.from(i));
  }

  @Post(':id/instructions')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.EXERCISE })
  @ApiOperation({ summary: 'Create or update an instruction for a language' })
  @ApiCreatedResponse({ description: 'Returns instructionId and wasCreated flag' })
  async upsertInstruction(
    @Param('id') exerciseId: string,
    @Body() dto: UpsertExerciseInstructionRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UpsertInstructionResult> {
    const result = await this.commandBus.execute<
      UpsertExerciseInstructionCommand,
      Result<UpsertInstructionResult, ExerciseDomainError>
    >(
      new UpsertExerciseInstructionCommand(
        user.userId,
        exerciseId,
        dto.instructionLanguage,
        dto.instructionText,
        dto.hintText,
        dto.textOverrides,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Delete(':id/instructions/:instructionId')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.EXERCISE })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an exercise instruction' })
  @ApiNoContentResponse()
  async removeInstruction(
    @Param('id') exerciseId: string,
    @Param('instructionId') instructionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      DeleteExerciseInstructionCommand,
      Result<void, ExerciseDomainError>
    >(new DeleteExerciseInstructionCommand(user.userId, exerciseId, instructionId));

    if (result.isFail) throwHttpException(result.error);
  }
}
