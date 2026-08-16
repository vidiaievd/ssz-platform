import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';

import { GetStudentReviewGroupQuery } from '../../application/queries/get-student-review-group/get-student-review-group.query.js';
import type { StudentReviewGroupResult } from '../../application/queries/get-student-review-group/get-student-review-group.handler.js';

import { GetReviewReviewersQuery } from '../../application/queries/get-review-reviewers/get-review-reviewers.query.js';
import type { ReviewReviewersResult } from '../../application/queries/get-review-reviewers/get-review-reviewers.handler.js';
import { GetReviewReviewersRequestDto } from '../dto/get-review-reviewers.request.dto.js';

import { GetReviewScopeQuery } from '../../application/queries/get-review-scope/get-review-scope.query.js';
import type { ReviewScopeResult } from '../../application/queries/get-review-scope/get-review-scope.handler.js';

// Expresses reviewers(sub) (plan 44 §0.2, §44.2) — who may review a student's
// work — once, here, instead of re-deriving it in the BFF and the
// notification cron. Service-to-service only, same guard as internal.controller.ts.
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal')
export class InternalReviewController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('schools/:schoolId/students/:userId/group')
  async getStudentGroup(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('userId') userId: string,
    @Query('courseId') courseId?: string,
  ): Promise<StudentReviewGroupResult> {
    return this.queryBus.execute<GetStudentReviewGroupQuery, StudentReviewGroupResult>(
      new GetStudentReviewGroupQuery(schoolId, userId, courseId),
    );
  }

  @Post('review/reviewers')
  @HttpCode(200)
  async getReviewers(
    @Body() dto: GetReviewReviewersRequestDto,
  ): Promise<ReviewReviewersResult> {
    const at = dto.at ? new Date(dto.at) : new Date();
    return this.queryBus.execute<GetReviewReviewersQuery, ReviewReviewersResult>(
      new GetReviewReviewersQuery(dto.groupIds, at),
    );
  }

  @Get('review/scope')
  async getReviewScope(
    @Query('schoolId', ParseUUIDPipe) schoolId: string,
    @Query('teacherId') teacherId: string,
    @Query('at') at?: string,
  ): Promise<ReviewScopeResult> {
    return this.queryBus.execute<GetReviewScopeQuery, ReviewScopeResult>(
      new GetReviewScopeQuery(schoolId, teacherId, at ? new Date(at) : new Date()),
    );
  }
}
