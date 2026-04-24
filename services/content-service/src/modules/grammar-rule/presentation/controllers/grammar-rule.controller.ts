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
import { PaginatedResponseDto } from '../../../../shared/discovery/presentation/dto/paginated-response.dto.js';
import { ApiPaginatedResponse } from '../../../../shared/discovery/presentation/decorators/api-paginated-response.decorator.js';

// Commands — rule
import { CreateGrammarRuleCommand } from '../../application/commands/create-grammar-rule/create-grammar-rule.command.js';
import type { CreateGrammarRuleResult } from '../../application/commands/create-grammar-rule/create-grammar-rule.handler.js';
import { UpdateGrammarRuleCommand } from '../../application/commands/update-grammar-rule/update-grammar-rule.command.js';
import { DeleteGrammarRuleCommand } from '../../application/commands/delete-grammar-rule/delete-grammar-rule.command.js';

// Commands — explanations
import { CreateExplanationCommand } from '../../application/commands/create-explanation/create-explanation.command.js';
import type { CreateExplanationResult } from '../../application/commands/create-explanation/create-explanation.handler.js';
import { UpdateExplanationCommand } from '../../application/commands/update-explanation/update-explanation.command.js';
import { PublishExplanationCommand } from '../../application/commands/publish-explanation/publish-explanation.command.js';
import { DeleteExplanationCommand } from '../../application/commands/delete-explanation/delete-explanation.command.js';

// Commands — pool
import { AddPoolEntryCommand } from '../../application/commands/add-pool-entry/add-pool-entry.command.js';
import type { AddPoolEntryResult } from '../../application/commands/add-pool-entry/add-pool-entry.handler.js';
import { UpdatePoolEntryCommand } from '../../application/commands/update-pool-entry/update-pool-entry.command.js';
import { RemovePoolEntryCommand } from '../../application/commands/remove-pool-entry/remove-pool-entry.command.js';
import { ReorderPoolCommand } from '../../application/commands/reorder-pool/reorder-pool.command.js';

// Queries
import { GetGrammarRulesQuery } from '../../application/queries/get-grammar-rules/get-grammar-rules.query.js';
import { GetGrammarRuleQuery } from '../../application/queries/get-grammar-rule/get-grammar-rule.query.js';
import { GetGrammarRuleExplanationsQuery } from '../../application/queries/get-grammar-rule-explanations/get-grammar-rule-explanations.query.js';
import { GetGrammarRuleExplanationQuery } from '../../application/queries/get-grammar-rule-explanation/get-grammar-rule-explanation.query.js';
import { GetBestExplanationQuery } from '../../application/queries/get-best-explanation/get-best-explanation.query.js';
import type { GetBestExplanationResult } from '../../application/queries/get-best-explanation/get-best-explanation.handler.js';
import { GetPoolEntriesQuery } from '../../application/queries/get-pool-entries/get-pool-entries.query.js';
import { GetRandomPoolExerciseQuery } from '../../application/queries/get-random-pool-exercise/get-random-pool-exercise.query.js';

// Domain types
import type { GrammarRuleDomainError } from '../../domain/exceptions/grammar-rule-domain.exceptions.js';
import type { GrammarRuleEntity } from '../../domain/entities/grammar-rule.entity.js';
import type { GrammarRuleExplanationEntity } from '../../domain/entities/grammar-rule-explanation.entity.js';
import type { PoolEntryWithExercise } from '../../domain/repositories/grammar-rule-exercise-pool.repository.interface.js';
import type { ExerciseEntity } from '../../../exercise/domain/entities/exercise.entity.js';
import { DifficultyLevel } from '../../../container/domain/value-objects/difficulty-level.vo.js';

// Request DTOs
import { CreateGrammarRuleRequestDto } from '../dto/requests/create-grammar-rule.request.dto.js';
import { UpdateGrammarRuleRequestDto } from '../dto/requests/update-grammar-rule.request.dto.js';
import { GrammarRuleListQueryDto } from '../dto/requests/grammar-rule-list-query.dto.js';
import { CreateExplanationRequestDto } from '../dto/requests/create-explanation.request.dto.js';
import { UpdateExplanationRequestDto } from '../dto/requests/update-explanation.request.dto.js';
import { AddPoolEntryRequestDto } from '../dto/requests/add-pool-entry.request.dto.js';
import { UpdatePoolEntryRequestDto } from '../dto/requests/update-pool-entry.request.dto.js';
import { ReorderPoolRequestDto } from '../dto/requests/reorder-pool.request.dto.js';
import { GrammarRuleExplanationsQueryDto } from '../dto/requests/grammar-rule-explanations-query.dto.js';
import { GrammarRulePoolQueryDto } from '../dto/requests/grammar-rule-pool-query.dto.js';

// Response DTOs
import { GrammarRuleResponseDto } from '../dto/responses/grammar-rule.response.dto.js';
import { GrammarRuleExplanationResponseDto } from '../dto/responses/grammar-rule-explanation.response.dto.js';
import { PoolEntryResponseDto } from '../dto/responses/pool-entry.response.dto.js';
import { ExerciseResponseDto } from '../../../exercise/presentation/dto/responses/exercise.response.dto.js';

// Error mapper
import { throwHttpException } from '../utils/domain-error.mapper.js';

@ApiTags('Grammar Rules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('grammar-rules')
export class GrammarRuleController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  // ── GrammarRule CRUD ───────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create a new grammar rule' })
  @ApiCreatedResponse({ description: 'Returns the new rule ID' })
  async create(
    @Body() dto: CreateGrammarRuleRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ ruleId: string }> {
    const result = await this.commandBus.execute<
      CreateGrammarRuleCommand,
      Result<CreateGrammarRuleResult, GrammarRuleDomainError>
    >(
      new CreateGrammarRuleCommand(
        user.userId,
        dto.targetLanguage,
        dto.difficultyLevel,
        dto.topic,
        dto.title,
        dto.visibility,
        dto.subtopic,
        dto.description,
        dto.ownerSchoolId,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Get()
  @ApiOperation({ summary: 'List grammar rules with optional filters' })
  @ApiPaginatedResponse(GrammarRuleResponseDto)
  async findAll(
    @Query() dto: GrammarRuleListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedResponseDto<GrammarRuleResponseDto>> {
    const paged = await this.queryBus.execute<
      GetGrammarRulesQuery,
      PaginatedResult<GrammarRuleEntity>
    >(new GetGrammarRulesQuery(dto, user));

    return new PaginatedResponseDto({
      items: paged.items.map((r) => GrammarRuleResponseDto.from(r)),
      total: paged.total,
      page: paged.page,
      limit: paged.limit,
      totalPages: paged.totalPages,
    });
  }

  @Get(':id')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.GRAMMAR_RULE })
  @ApiOperation({ summary: 'Get a grammar rule by ID' })
  @ApiOkResponse({ type: GrammarRuleResponseDto })
  async findOne(@Param('id') id: string): Promise<GrammarRuleResponseDto> {
    const result = await this.queryBus.execute<
      GetGrammarRuleQuery,
      Result<GrammarRuleEntity, GrammarRuleDomainError>
    >(new GetGrammarRuleQuery(id));

    if (result.isFail) throwHttpException(result.error);
    return GrammarRuleResponseDto.from(result.value);
  }

  @Patch(':id')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.GRAMMAR_RULE })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update grammar rule metadata' })
  @ApiNoContentResponse()
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateGrammarRuleRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      UpdateGrammarRuleCommand,
      Result<void, GrammarRuleDomainError>
    >(
      new UpdateGrammarRuleCommand(
        user.userId,
        id,
        dto.title,
        dto.description,
        dto.difficultyLevel,
        dto.topic,
        dto.subtopic,
        dto.visibility,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
  }

  @Delete(':id')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.GRAMMAR_RULE })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a grammar rule and all its explanations' })
  @ApiNoContentResponse()
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const result = await this.commandBus.execute<
      DeleteGrammarRuleCommand,
      Result<void, GrammarRuleDomainError>
    >(new DeleteGrammarRuleCommand(user.userId, id));

    if (result.isFail) throwHttpException(result.error);
  }

  // ── Explanations sub-resource ──────────────────────────────────────────────

  @Post(':id/explanations')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.GRAMMAR_RULE })
  @ApiOperation({ summary: 'Add a new explanation variant to a grammar rule' })
  @ApiCreatedResponse({ description: 'Returns the new explanation ID' })
  async createExplanation(
    @Param('id') ruleId: string,
    @Body() dto: CreateExplanationRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ explanationId: string }> {
    const result = await this.commandBus.execute<
      CreateExplanationCommand,
      Result<CreateExplanationResult, GrammarRuleDomainError>
    >(
      new CreateExplanationCommand(
        user.userId,
        ruleId,
        dto.explanationLanguage,
        dto.minLevel,
        dto.maxLevel,
        dto.displayTitle,
        dto.bodyMarkdown,
        dto.displaySummary,
        dto.estimatedReadingMinutes,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Get(':id/explanations')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.GRAMMAR_RULE })
  @ApiOperation({ summary: 'List explanations for a grammar rule with optional filters and pagination' })
  @ApiPaginatedResponse(GrammarRuleExplanationResponseDto)
  async findExplanations(
    @Param('id') ruleId: string,
    @Query() dto: GrammarRuleExplanationsQueryDto,
  ): Promise<PaginatedResponseDto<GrammarRuleExplanationResponseDto>> {
    const paged = await this.queryBus.execute<
      GetGrammarRuleExplanationsQuery,
      PaginatedResult<GrammarRuleExplanationEntity>
    >(new GetGrammarRuleExplanationsQuery(ruleId, dto));

    return new PaginatedResponseDto({
      items: paged.items.map((e) => GrammarRuleExplanationResponseDto.from(e)),
      total: paged.total,
      page: paged.page,
      limit: paged.limit,
      totalPages: paged.totalPages,
    });
  }

  @Get(':id/explanations/best')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.GRAMMAR_RULE })
  @ApiOperation({ summary: 'Select the best explanation for a student based on their profile' })
  @ApiOkResponse({ type: GrammarRuleExplanationResponseDto })
  async findBestExplanation(
    @Param('id') ruleId: string,
    @Query('lang') studentNativeLanguage: string,
    @Query('level') studentCurrentLevel: DifficultyLevel,
    @Query('knownLangs') knownLangs?: string,
  ): Promise<{ explanation: GrammarRuleExplanationResponseDto; fallbackUsed: boolean }> {
    const result = await this.queryBus.execute<
      GetBestExplanationQuery,
      Result<GetBestExplanationResult, GrammarRuleDomainError>
    >(
      new GetBestExplanationQuery(
        ruleId,
        studentNativeLanguage,
        studentCurrentLevel,
        knownLangs ? knownLangs.split(',') : [],
      ),
    );

    if (result.isFail) throwHttpException(result.error);
    return {
      explanation: GrammarRuleExplanationResponseDto.from(result.value.explanation),
      fallbackUsed: result.value.fallbackUsed,
    };
  }

  @Get(':id/explanations/:explanationId')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.GRAMMAR_RULE })
  @ApiOperation({ summary: 'Get a single explanation by ID' })
  @ApiOkResponse({ type: GrammarRuleExplanationResponseDto })
  async findExplanation(
    @Param('id') ruleId: string,
    @Param('explanationId') explanationId: string,
  ): Promise<GrammarRuleExplanationResponseDto> {
    const result = await this.queryBus.execute<
      GetGrammarRuleExplanationQuery,
      Result<GrammarRuleExplanationEntity, GrammarRuleDomainError>
    >(new GetGrammarRuleExplanationQuery(ruleId, explanationId));

    if (result.isFail) throwHttpException(result.error);
    return GrammarRuleExplanationResponseDto.from(result.value);
  }

  @Patch(':id/explanations/:explanationId')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.GRAMMAR_RULE })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update an explanation (allowed on draft and published)' })
  @ApiNoContentResponse()
  async updateExplanation(
    @Param('id') ruleId: string,
    @Param('explanationId') explanationId: string,
    @Body() dto: UpdateExplanationRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      UpdateExplanationCommand,
      Result<void, GrammarRuleDomainError>
    >(
      new UpdateExplanationCommand(
        user.userId,
        ruleId,
        explanationId,
        dto.displayTitle,
        dto.displaySummary,
        dto.bodyMarkdown,
        dto.estimatedReadingMinutes,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
  }

  @Post(':id/explanations/:explanationId/publish')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.GRAMMAR_RULE })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Publish a draft explanation (DRAFT → PUBLISHED)' })
  @ApiNoContentResponse()
  async publishExplanation(
    @Param('id') ruleId: string,
    @Param('explanationId') explanationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      PublishExplanationCommand,
      Result<void, GrammarRuleDomainError>
    >(new PublishExplanationCommand(user.userId, ruleId, explanationId));

    if (result.isFail) throwHttpException(result.error);
  }

  @Delete(':id/explanations/:explanationId')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.GRAMMAR_RULE })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Hard-delete an explanation' })
  @ApiNoContentResponse()
  async deleteExplanation(
    @Param('id') ruleId: string,
    @Param('explanationId') explanationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      DeleteExplanationCommand,
      Result<void, GrammarRuleDomainError>
    >(new DeleteExplanationCommand(user.userId, ruleId, explanationId));

    if (result.isFail) throwHttpException(result.error);
  }

  // ── Exercise pool sub-resource ─────────────────────────────────────────────

  @Post(':id/pool')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.GRAMMAR_RULE })
  @ApiOperation({ summary: 'Add an exercise to the grammar rule exercise pool' })
  @ApiCreatedResponse({ description: 'Returns the new pool entry ID' })
  async addPoolEntry(
    @Param('id') ruleId: string,
    @Body() dto: AddPoolEntryRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ entryId: string }> {
    const result = await this.commandBus.execute<
      AddPoolEntryCommand,
      Result<AddPoolEntryResult, GrammarRuleDomainError>
    >(new AddPoolEntryCommand(user.userId, ruleId, dto.exerciseId, dto.weight));

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Get(':id/pool')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.GRAMMAR_RULE })
  @ApiOperation({ summary: 'List pool entries for a grammar rule with pagination' })
  @ApiPaginatedResponse(PoolEntryResponseDto)
  async findPoolEntries(
    @Param('id') ruleId: string,
    @Query() dto: GrammarRulePoolQueryDto,
  ): Promise<PaginatedResponseDto<PoolEntryResponseDto>> {
    const paged = await this.queryBus.execute<
      GetPoolEntriesQuery,
      PaginatedResult<PoolEntryWithExercise>
    >(new GetPoolEntriesQuery(ruleId, dto));

    return new PaginatedResponseDto({
      items: paged.items.map((item) => PoolEntryResponseDto.fromPoolEntryWithExercise(item)),
      total: paged.total,
      page: paged.page,
      limit: paged.limit,
      totalPages: paged.totalPages,
    });
  }

  @Get(':id/pool/random')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.GRAMMAR_RULE })
  @ApiOperation({ summary: 'Get a weighted-random exercise from the pool' })
  @ApiOkResponse({ type: ExerciseResponseDto })
  async getRandomExercise(
    @Param('id') ruleId: string,
    @Query('exclude') exclude?: string,
  ): Promise<ExerciseResponseDto> {
    const excludeIds = exclude ? exclude.split(',').filter(Boolean) : [];
    const result = await this.queryBus.execute<
      GetRandomPoolExerciseQuery,
      Result<ExerciseEntity, GrammarRuleDomainError>
    >(new GetRandomPoolExerciseQuery(ruleId, excludeIds));

    if (result.isFail) throwHttpException(result.error);
    return ExerciseResponseDto.from(result.value);
  }

  @Patch(':id/pool/:exerciseId')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.GRAMMAR_RULE })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update the weight of a pool entry' })
  @ApiNoContentResponse()
  async updatePoolEntry(
    @Param('id') ruleId: string,
    @Param('exerciseId') exerciseId: string,
    @Body() dto: UpdatePoolEntryRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      UpdatePoolEntryCommand,
      Result<void, GrammarRuleDomainError>
    >(new UpdatePoolEntryCommand(user.userId, ruleId, exerciseId, dto.weight));

    if (result.isFail) throwHttpException(result.error);
  }

  @Post(':id/pool/reorder')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.GRAMMAR_RULE })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reorder pool entries' })
  @ApiNoContentResponse()
  async reorderPool(
    @Param('id') ruleId: string,
    @Body() dto: ReorderPoolRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      ReorderPoolCommand,
      Result<void, GrammarRuleDomainError>
    >(new ReorderPoolCommand(user.userId, ruleId, dto.items));

    if (result.isFail) throwHttpException(result.error);
  }

  @Delete(':id/pool/:exerciseId')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.GRAMMAR_RULE })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an exercise from the pool' })
  @ApiNoContentResponse()
  async removePoolEntry(
    @Param('id') ruleId: string,
    @Param('exerciseId') exerciseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      RemovePoolEntryCommand,
      Result<void, GrammarRuleDomainError>
    >(new RemovePoolEntryCommand(user.userId, ruleId, exerciseId));

    if (result.isFail) throwHttpException(result.error);
  }
}
