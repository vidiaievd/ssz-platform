import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import {
  ListMySubmissionsQuery,
  MY_SUBMISSIONS_STATUSES,
  type MySubmissionsStatus,
} from '../../application/queries/list-my-submissions/list-my-submissions.query.js';
import type { ListMySubmissionsResult } from '../../application/queries/list-my-submissions/list-my-submissions.handler.js';
import { decodeMySubmissionsCursor } from '../../application/queries/list-my-submissions/my-submissions-cursor.js';
import { MySubmissionsResponseDto } from '../dto/my-submissions.dto.js';
import { ListMyMistakesQuery } from '../../application/queries/list-my-mistakes/list-my-mistakes.query.js';
import type { ListMyMistakesResult } from '../../application/queries/list-my-mistakes/list-my-mistakes.handler.js';
import { MyMistakesResponseDto } from '../dto/my-mistakes.dto.js';

/** A short list for a card, not a screen to page through; a hundred is the ceiling. */
const DEFAULT_LIMIT = 20;

/** The Practice tab shows three; a screen of them would page, which this list does not. */
const MISTAKES_DEFAULT_LIMIT = 3;
const MISTAKES_MAX_LIMIT = 20;

/**
 * A learner's own submissions, read with their own token — the mobile «Today» screen
 * (VoxOrd mobile redesign 02, step 4), which has no BFF to call the internal route for it.
 *
 * The same rows as `GET internal/attempts/review/mine`, by the same query handler. The one
 * difference is where the learner comes from: there the caller names them, here the token
 * does, and there is no parameter that could name anyone else.
 */
@ApiTags('attempts')
@ApiBearerAuth()
@Controller('attempts')
export class MySubmissionsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('mine')
  @ApiOperation({
    summary: 'My submissions that went to a reviewer, newest first',
    description:
      'Every attempt of mine handed to a teacher — or, without a school, to a model — and what became ' +
      'of it. Never the answer itself, the answer key or per-item notes.',
  })
  @ApiQuery({ name: 'status', required: false, enum: MY_SUBMISSIONS_STATUSES })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Page size (default 20, max 100)' })
  @ApiQuery({ name: 'cursor', required: false, description: '`nextCursor` of the previous page' })
  @ApiResponse({ status: 200, type: MySubmissionsResponseDto })
  @ApiResponse({ status: 401, description: 'No or invalid token' })
  @ApiResponse({ status: 422, description: 'Unknown status, or a cursor this service did not issue' })
  async listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('limit', new DefaultValuePipe(DEFAULT_LIMIT), ParseIntPipe) limit = DEFAULT_LIMIT,
    @Query('cursor') cursor?: string,
  ): Promise<ListMySubmissionsResult> {
    const safeStatus = status ?? 'all';
    if (!MY_SUBMISSIONS_STATUSES.includes(safeStatus as MySubmissionsStatus)) {
      throw new UnprocessableEntityException('Invalid status');
    }

    const after = cursor ? decodeMySubmissionsCursor(cursor) : null;
    if (cursor && after === null) {
      throw new UnprocessableEntityException('Malformed cursor');
    }

    return this.queryBus.execute<ListMySubmissionsQuery, ListMySubmissionsResult>(
      new ListMySubmissionsQuery(
        user.userId,
        safeStatus as MySubmissionsStatus,
        Math.min(Math.max(limit, 1), 100),
        after,
      ),
    );
  }

  @Get('mistakes')
  @ApiOperation({
    summary: 'My exercises whose latest scored attempt failed, newest first',
    description:
      'Machine-scored attempts in a course only — no probes, no work a reviewer judged. A later ' +
      'passing attempt takes the exercise off the list. Never the answer or the key (VoxOrd plan 05, step 8).',
  })
  @ApiQuery({ name: 'courseId', required: false, format: 'uuid', description: 'One course only' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Default 3, max 20' })
  @ApiResponse({ status: 200, type: MyMistakesResponseDto })
  @ApiResponse({ status: 401, description: 'No or invalid token' })
  async listMyMistakes(
    @CurrentUser() user: AuthenticatedUser,
    @Query('courseId') courseId?: string,
    @Query('limit', new DefaultValuePipe(MISTAKES_DEFAULT_LIMIT), ParseIntPipe) limit = MISTAKES_DEFAULT_LIMIT,
  ): Promise<ListMyMistakesResult> {
    return this.queryBus.execute<ListMyMistakesQuery, ListMyMistakesResult>(
      new ListMyMistakesQuery(user.userId, courseId ?? null, Math.min(Math.max(limit, 1), MISTAKES_MAX_LIMIT)),
    );
  }
}
