import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../infrastructure/auth/jwt-verifier.service.js';
import { SubmitExerciseCommand } from '../application/commands/submit-exercise.command.js';
import { ResubmitCommand } from '../application/commands/resubmit.command.js';
import { ReviewSubmissionCommand } from '../application/commands/review-submission.command.js';
import { GetSubmissionQuery } from '../application/queries/get-submission.query.js';
import { ListUserSubmissionsQuery } from '../application/queries/list-user-submissions.query.js';
import { ListPendingReviewsQuery } from '../application/queries/list-pending-reviews.query.js';
import type { SubmissionDto } from '../application/dto/submission.dto.js';
import type { Result } from '../../../shared/kernel/result.js';
import {
  SubmissionNotFoundError,
  SubmissionForbiddenError,
  SubmissionDomainValidationError,
  ReviewerNotAuthorizedError,
  type ReviewApplicationError,
} from '../application/errors/review-application.errors.js';
import { SubmitExerciseRequest, ResubmitRequest, ReviewRequest } from './dto/review.request.js';
import { SubmissionResponse } from './dto/submission.response.js';

@ApiTags('review')
@ApiBearerAuth()
@Controller('review/submissions')
export class ReviewController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Submit a free-form exercise for review' })
  @ApiResponse({ status: 201, type: SubmissionResponse })
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SubmitExerciseRequest,
  ): Promise<SubmissionResponse> {
    const result: Result<SubmissionDto, ReviewApplicationError> = await this.commandBus.execute(
      new SubmitExerciseCommand(
        user.userId,
        body.exerciseId,
        { text: body.text, mediaRefs: body.mediaRefs },
        body.assignmentId,
        body.schoolId,
      ),
    );
    return this.unwrap(result);
  }

  @Post(':id/resubmit')
  @ApiOperation({ summary: 'Resubmit after revision was requested' })
  @ApiResponse({ status: 201, type: SubmissionResponse })
  async resubmit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ResubmitRequest,
  ): Promise<SubmissionResponse> {
    const result: Result<SubmissionDto, ReviewApplicationError> = await this.commandBus.execute(
      new ResubmitCommand(id, user.userId, { text: body.text, mediaRefs: body.mediaRefs }),
    );
    return this.unwrap(result);
  }

  @Patch(':id/review')
  @ApiOperation({ summary: 'Review a submission (teacher/admin)' })
  @ApiResponse({ status: 200, type: SubmissionResponse })
  async review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ReviewRequest,
  ): Promise<SubmissionResponse> {
    const result: Result<SubmissionDto, ReviewApplicationError> = await this.commandBus.execute(
      new ReviewSubmissionCommand(id, user.userId, user.roles, body.decision, body.feedback, body.score),
    );
    return this.unwrap(result);
  }

  @Get()
  @ApiOperation({ summary: "List current user's submissions" })
  @ApiResponse({ status: 200, type: [SubmissionResponse] })
  async listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<SubmissionResponse[]> {
    return this.queryBus.execute(new ListUserSubmissionsQuery(user.userId, status, limit, offset));
  }

  @Get('pending')
  @ApiOperation({ summary: 'List pending submissions for a school (teacher/admin)' })
  @ApiResponse({ status: 200, type: [SubmissionResponse] })
  async listPending(
    @Query('schoolId') schoolId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<SubmissionResponse[]> {
    return this.queryBus.execute(new ListPendingReviewsQuery(schoolId, limit, offset));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get submission by id' })
  @ApiResponse({ status: 200, type: SubmissionResponse })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<SubmissionResponse> {
    const result: Result<SubmissionDto, ReviewApplicationError> = await this.queryBus.execute(
      new GetSubmissionQuery(id, user.userId, user.roles),
    );
    return this.unwrap(result);
  }

  private unwrap<T>(result: Result<T, any>): T {
    if (result.isOk) return result.value;
    const err = result.error as ReviewApplicationError;
    if (err instanceof SubmissionNotFoundError) throw new NotFoundException(err.message);
    if (err instanceof SubmissionForbiddenError || err instanceof ReviewerNotAuthorizedError) {
      throw new ForbiddenException(err.message);
    }
    if (err instanceof SubmissionDomainValidationError) throw new UnprocessableEntityException(err.message);
    throw new NotFoundException(err.message);
  }
}
