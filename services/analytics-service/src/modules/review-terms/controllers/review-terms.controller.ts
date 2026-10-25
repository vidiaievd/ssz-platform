import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../common/guards/internal-auth.guard.js';
import { parseDayRange } from '../../../common/day-range.js';
import {
  GetSchoolReviewTermsQuery,
  GetTeacherReviewTermsQuery,
} from '../queries/get-school-review-terms.query.js';
import type {
  SchoolReviewTermsResult,
  TeacherReviewTermsResult,
} from '../queries/get-school-review-terms.handler.js';

/**
 * Reading the auto-acceptance journal — plan 80, step 6b.
 *
 * Internal: the web BFF asks on behalf of a school admin or a teacher and checks the role
 * itself, as it already does for the review queue. Days are the days the terms ran out, UTC,
 * inclusive.
 *
 * - `GET /internal/review-terms/schools/:schoolId?from=&to=` — the school's totals (each work
 *   once) and the same work per teacher who answered for it; `teachers: null` when
 *   organization-service could not be asked.
 * - `GET /internal/review-terms/schools/:schoolId/teachers/:teacherId?from=&to=` — one
 *   teacher's line; 503 without organization-service.
 */
@ApiExcludeController()
@Controller('internal/review-terms/schools/:schoolId')
@Public()
@UseGuards(InternalAuthGuard)
export class ReviewTermsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  async school(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<SchoolReviewTermsResult> {
    parseDayRange(from, to);
    return this.queryBus.execute(new GetSchoolReviewTermsQuery(schoolId, from!, to!));
  }

  @Get('teachers/:teacherId')
  async teacher(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('teacherId', ParseUUIDPipe) teacherId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<TeacherReviewTermsResult> {
    parseDayRange(from, to);
    return this.queryBus.execute(new GetTeacherReviewTermsQuery(schoolId, teacherId, from!, to!));
  }
}
