import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../infrastructure/auth/jwt-verifier.service.js';
import { UpsertProgressCommand } from '../application/commands/upsert-progress.command.js';
import { MarkNeedsReviewCommand } from '../application/commands/mark-needs-review.command.js';
import { ResolveReviewCommand } from '../application/commands/resolve-review.command.js';
import { GetUserProgressQuery } from '../application/queries/get-user-progress.query.js';
import { GetContentProgressQuery } from '../application/queries/get-content-progress.query.js';
import { GetAssignmentProgressQuery } from '../application/queries/get-assignment-progress.query.js';
import type { ProgressDto, AssignmentProgressDto } from '../application/dto/progress.dto.js';
import type { Result } from '../../../shared/kernel/result.js';
import {
  ProgressNotFoundError,
  ProgressForbiddenError,
  ProgressDomainValidationError,
  AssignmentNotFoundForProgressError,
  type ProgressApplicationError,
} from '../application/errors/progress-application.errors.js';
import {
  UpsertProgressRequest,
  FlagProgressRequest,
  ResolveProgressRequest,
} from './dto/upsert-progress.request.js';
import { ProgressResponse, AssignmentProgressResponse } from './dto/progress.response.js';

@ApiTags('progress')
@ApiBearerAuth()
@Controller('progress')
export class ProgressController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Record an exercise attempt and upsert progress' })
  @ApiResponse({ status: 200, type: ProgressResponse })
  async upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpsertProgressRequest,
  ): Promise<ProgressResponse> {
    const result: Result<ProgressDto, ProgressApplicationError> = await this.commandBus.execute(
      new UpsertProgressCommand(
        user.userId,
        body.contentType,
        body.contentId,
        body.timeSpentSeconds,
        body.score ?? null,
        body.completed,
      ),
    );
    return this.unwrap(result);
  }

  @Get()
  @ApiOperation({ summary: "List current user's progress records" })
  @ApiResponse({ status: 200, type: [ProgressResponse] })
  async listUserProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Query('contentType') contentType?: string,
  ): Promise<ProgressResponse[]> {
    return this.queryBus.execute(new GetUserProgressQuery(user.userId, contentType));
  }

  @Get('assignment/:id')
  @ApiOperation({ summary: "Get assignee's progress for a specific assignment" })
  @ApiResponse({ status: 200, type: AssignmentProgressResponse })
  @ApiResponse({ status: 404 })
  async getAssignmentProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<AssignmentProgressResponse> {
    const result: Result<AssignmentProgressDto, ProgressApplicationError> =
      await this.queryBus.execute(new GetAssignmentProgressQuery(id, user.userId));
    return this.unwrap(result);
  }

  @Get(':contentType/:contentId')
  @ApiOperation({ summary: "Get current user's progress for a specific content item" })
  @ApiResponse({ status: 200, type: ProgressResponse })
  @ApiResponse({ status: 404 })
  async getContentProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contentType') contentType: string,
    @Param('contentId') contentId: string,
  ): Promise<ProgressResponse> {
    const dto: ProgressDto | null = await this.queryBus.execute(
      new GetContentProgressQuery(user.userId, contentType, contentId),
    );
    if (!dto) throw new NotFoundException('No progress record found for this content');
    return dto as ProgressResponse;
  }

  @Patch(':contentType/:contentId/flag')
  @ApiOperation({ summary: 'Flag a student\'s progress record as needing review' })
  @ApiResponse({ status: 200, type: ProgressResponse })
  async flagForReview(
    @Param('contentType') contentType: string,
    @Param('contentId') contentId: string,
    @Body() body: FlagProgressRequest,
  ): Promise<ProgressResponse> {
    const result: Result<ProgressDto, ProgressApplicationError> = await this.commandBus.execute(
      new MarkNeedsReviewCommand(body.targetUserId, contentType, contentId),
    );
    return this.unwrap(result);
  }

  @Patch(':contentType/:contentId/resolve')
  @ApiOperation({ summary: "Resolve a student's review flag" })
  @ApiResponse({ status: 200, type: ProgressResponse })
  async resolveReview(
    @Param('contentType') contentType: string,
    @Param('contentId') contentId: string,
    @Body() body: ResolveProgressRequest,
  ): Promise<ProgressResponse> {
    const result: Result<ProgressDto, ProgressApplicationError> = await this.commandBus.execute(
      new ResolveReviewCommand(body.targetUserId, contentType, contentId, body.approved),
    );
    return this.unwrap(result);
  }

  private unwrap<T>(result: Result<T, any>): T {
    if (result.isOk) return result.value;
    const err = result.error as ProgressApplicationError;
    if (err instanceof ProgressNotFoundError || err instanceof AssignmentNotFoundForProgressError) {
      throw new NotFoundException(err.message);
    }
    if (err instanceof ProgressForbiddenError) {
      throw new ForbiddenException(err.message);
    }
    throw new NotFoundException(err.message);
  }
}
