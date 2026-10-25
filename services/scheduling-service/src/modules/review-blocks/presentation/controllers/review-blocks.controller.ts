import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import {
  parseRange,
  resolveScheduleTarget,
} from '../../../slots/presentation/controllers/my-schedule.rules.js';
import type { ReviewBlock } from '../../domain/entities/review-block.entity.js';
import type { ReviewBlockChanges } from '../../domain/repositories/review-block.repository.interface.js';
import type { ReviewBlockWindow } from '../../application/queries/review-block-window.js';
import { CreateReviewBlockCommand } from '../../application/commands/create-review-block/create-review-block.command.js';
import { UpdateReviewBlockCommand } from '../../application/commands/update-review-block/update-review-block.command.js';
import { DeleteReviewBlockCommand } from '../../application/commands/delete-review-block/delete-review-block.command.js';
import { SkipReviewBlockDayCommand } from '../../application/commands/skip-review-block-day/skip-review-block-day.command.js';
import { ListTeacherReviewBlocksQuery } from '../../application/queries/list-teacher-review-blocks/list-teacher-review-blocks.query.js';
import { ListSchoolReviewBlocksQuery } from '../../application/queries/list-school-review-blocks/list-school-review-blocks.query.js';
import {
  CreateReviewBlockDto,
  PatchReviewBlockDto,
  ReviewBlockResponseDto,
  ReviewBlockWindowDto,
  SkipReviewBlockDayDto,
  parseDay,
  toReviewBlockDto,
  toReviewBlockWindowDto,
} from '../dto/review-block.dto.js';

@ApiTags('Review blocks')
@ApiBearerAuth()
@Controller('scheduling')
export class ReviewBlocksController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('teachers/:teacherId/review-blocks')
  @ApiOperation({
    summary: "A teacher's own time for marking in a window, across every school",
    description:
      'The rules (for editing) and their dated sittings (for drawing). `me` is the caller. ' +
      'Learners never see these: no group, no roster, no reminder reads them.',
  })
  @ApiQuery({ name: 'from', example: '2026-10-26', description: 'First day, inclusive' })
  @ApiQuery({ name: 'to', example: '2026-11-01', description: 'Last day, inclusive' })
  @ApiResponse({ status: 200, type: ReviewBlockWindowDto })
  @ApiResponse({ status: 400, description: 'Missing, unordered or too wide a range' })
  @ApiResponse({ status: 403, description: "Somebody else's schedule" })
  async listMine(
    @Param('teacherId') teacherId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReviewBlockWindowDto> {
    const target = resolveScheduleTarget(teacherId, user);
    const range = parseRange(from, to);
    const window = await this.queryBus.execute<ListTeacherReviewBlocksQuery, ReviewBlockWindow>(
      new ListTeacherReviewBlocksQuery(target, range.from, range.to),
    );
    return toReviewBlockWindowDto(window);
  }

  @Get('schools/:schoolId/review-blocks')
  @ApiOperation({
    summary: "Every teacher's time for marking in a school",
    description: 'The timetable’s view — owner, admin, manager or scheduler.',
  })
  @ApiQuery({ name: 'from', example: '2026-10-26' })
  @ApiQuery({ name: 'to', example: '2026-11-01' })
  @ApiQuery({ name: 'teacherId', required: false, description: 'Only this teacher' })
  @ApiResponse({ status: 200, type: ReviewBlockWindowDto })
  @ApiResponse({ status: 403, description: 'Not the school’s timetable' })
  async listSchool(
    @Param('schoolId') schoolId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('teacherId') teacherId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReviewBlockWindowDto> {
    const range = parseRange(from, to);
    const window = await this.queryBus.execute<ListSchoolReviewBlocksQuery, ReviewBlockWindow>(
      new ListSchoolReviewBlocksQuery(schoolId, range.from, range.to, teacherId ?? null, user),
    );
    return toReviewBlockWindowDto(window);
  }

  @Post('schools/:schoolId/teachers/:teacherId/review-blocks')
  @ApiOperation({
    summary: 'Hold time for marking — once, or every week',
    description:
      'A teacher holds their own (`me`); the school’s timetable holds anybody’s who marks ' +
      'work there. Overlap with lessons is reported by the conflicts read, not refused here.',
  })
  @ApiResponse({ status: 201, type: ReviewBlockResponseDto })
  @ApiResponse({ status: 403, description: 'Neither the teacher nor the school’s timetable' })
  @ApiResponse({
    status: 422,
    description:
      'INVALID_TIME, END_TIME_NOT_AFTER_START, ENDS_BEFORE_START, ONE_OFF_SPANS_DAYS, ' +
      'or TARGET_NOT_REVIEWER — the person does not mark work in this school',
  })
  @ApiResponse({ status: 503, description: 'organization-service could not say who is who' })
  async create(
    @Param('schoolId') schoolId: string,
    @Param('teacherId') teacherId: string,
    @Body() body: CreateReviewBlockDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReviewBlockResponseDto> {
    const block = await this.commandBus.execute<CreateReviewBlockCommand, ReviewBlock>(
      new CreateReviewBlockCommand(
        schoolId,
        teacherId === 'me' ? user.userId : teacherId,
        body.repeat,
        parseDay(body.startsOn),
        body.endsOn ? parseDay(body.endsOn) : null,
        body.startTime,
        body.endTime,
        body.note ?? null,
        user,
      ),
    );
    return toReviewBlockDto(block);
  }

  @Patch('review-blocks/:blockId')
  @ApiOperation({
    summary: 'Change a block’s rule',
    description:
      'Changes every sitting of a series, past ones included. To keep the past, end the ' +
      'series and hold a new one.',
  })
  @ApiResponse({ status: 200, type: ReviewBlockResponseDto })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  @ApiResponse({ status: 422, description: 'The changed block breaks a shape rule' })
  async update(
    @Param('blockId') blockId: string,
    @Body() body: PatchReviewBlockDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReviewBlockResponseDto> {
    const changes: ReviewBlockChanges = {
      ...(body.repeat !== undefined ? { repeat: body.repeat } : {}),
      ...(body.startsOn !== undefined ? { startsOn: parseDay(body.startsOn) } : {}),
      ...(body.endsOn !== undefined ? { endsOn: body.endsOn === null ? null : parseDay(body.endsOn) } : {}),
      ...(body.startTime !== undefined ? { startTime: body.startTime } : {}),
      ...(body.endTime !== undefined ? { endTime: body.endTime } : {}),
      ...(body.note !== undefined ? { note: body.note } : {}),
    };
    const block = await this.commandBus.execute<UpdateReviewBlockCommand, ReviewBlock>(
      new UpdateReviewBlockCommand(blockId, changes, user),
    );
    return toReviewBlockDto(block);
  }

  @Delete('review-blocks/:blockId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a block, every sitting of it' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  async remove(
    @Param('blockId') blockId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.commandBus.execute(new DeleteReviewBlockCommand(blockId, user));
  }

  @Post('review-blocks/:blockId/skips')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Take one sitting out of a series',
    description: 'Idempotent. A one-off is deleted instead.',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  @ApiResponse({ status: 422, description: 'ONE_OFF_CANNOT_SKIP or NOT_AN_OCCURRENCE' })
  async skip(
    @Param('blockId') blockId: string,
    @Body() body: SkipReviewBlockDayDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.commandBus.execute(new SkipReviewBlockDayCommand(blockId, parseDay(body.date), user));
  }
}
