import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../infrastructure/auth/jwt-verifier.service.js';
import type { Result } from '../../../shared/kernel/result.js';
import { IntroduceCardCommand } from '../application/commands/introduce-card.command.js';
import {
  BulkIntroduceFromVocabularyListCommand,
} from '../application/commands/bulk-introduce-from-vocabulary-list.command.js';
import type { BulkIntroduceResult } from '../application/commands/bulk-introduce-from-vocabulary-list.handler.js';
import { ReviewCardCommand } from '../application/commands/review-card.command.js';
import { SuspendCardCommand } from '../application/commands/suspend-card.command.js';
import { UnsuspendCardCommand } from '../application/commands/unsuspend-card.command.js';
import { GetDueCardsQuery } from '../application/queries/get-due-cards.query.js';
import { GetCardByIdQuery } from '../application/queries/get-card-by-id.query.js';
import { GetUserSrsStatsQuery } from '../application/queries/get-user-srs-stats.query.js';
import type { ReviewCardDto, SrsStatsDto } from '../application/dto/srs.dto.js';
import {
  SrsCardNotFoundError,
  SrsCardUnauthorizedError,
  SrsCardSuspendedError,
  SrsNewCardLimitError,
  SrsReviewLimitError,
  type SrsApplicationError,
} from '../application/errors/srs-application.errors.js';
import {
  ReviewCardRequest,
  GetDueCardsRequest,
  IntroduceCardRequest,
  BulkIntroduceRequest,
} from './dto/review-card.request.js';
import { ReviewCardResponse, SrsStatsResponse, BulkIntroduceResponse } from './dto/srs.response.js';

@ApiTags('srs')
@ApiBearerAuth()
@Controller('srs')
export class SrsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  // ─── Due queue ────────────────────────────────────────────────────────────────

  @Get('due')
  @ApiOperation({
    summary: 'List cards due for review',
    description:
      'Returns up to `limit` cards due at or before now, ordered by dueAt ascending. ' +
      'Backed by a Redis sorted-set cache; falls back to DB on cache miss.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, type: [ReviewCardResponse] })
  async getDueCards(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetDueCardsRequest,
  ): Promise<ReviewCardResponse[]> {
    return this.queryBus.execute(new GetDueCardsQuery(user.userId, query.limit ?? 20));
  }

  // ─── Stats ────────────────────────────────────────────────────────────────────

  @Get('stats/me')
  @ApiOperation({ summary: "Get current user's SRS statistics" })
  @ApiResponse({ status: 200, type: SrsStatsResponse })
  async getMyStats(@CurrentUser() user: AuthenticatedUser): Promise<SrsStatsResponse> {
    return this.queryBus.execute(new GetUserSrsStatsQuery(user.userId));
  }

  // ─── Card actions ─────────────────────────────────────────────────────────────

  @Get('cards/:id')
  @ApiOperation({ summary: 'Get a single SRS review card by ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: ReviewCardResponse })
  @ApiResponse({ status: 404, description: 'Card not found' })
  async getCard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ReviewCardResponse> {
    const result: Result<ReviewCardDto, SrsApplicationError> = await this.queryBus.execute(
      new GetCardByIdQuery(user.userId, id),
    );
    return this.unwrap(result);
  }

  @Post('cards/:id/review')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Submit a review rating for a card',
    description:
      'Applies the FSRS algorithm, updates the card state, and returns the rescheduled card. ' +
      'Counts against the daily review cap (SRS_DAILY_REVIEWS_LIMIT).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: ReviewCardResponse })
  @ApiResponse({ status: 404, description: 'Card not found' })
  @ApiResponse({ status: 403, description: 'Card belongs to another user' })
  @ApiResponse({ status: 422, description: 'Card is suspended' })
  @ApiResponse({ status: 429, description: 'Daily review limit reached' })
  async reviewCard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ReviewCardRequest,
  ): Promise<ReviewCardResponse> {
    const result: Result<ReviewCardDto, SrsApplicationError> = await this.commandBus.execute(
      new ReviewCardCommand(
        user.userId,
        id,
        body.rating,
        body.reviewedAt ? new Date(body.reviewedAt) : undefined,
      ),
    );
    return this.unwrap(result);
  }

  @Post('cards/:id/suspend')
  @HttpCode(200)
  @ApiOperation({ summary: 'Suspend a card — removes it from the due queue' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: ReviewCardResponse })
  @ApiResponse({ status: 404 })
  @ApiResponse({ status: 403 })
  async suspendCard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ReviewCardResponse> {
    const result: Result<ReviewCardDto, SrsApplicationError> = await this.commandBus.execute(
      new SuspendCardCommand(user.userId, id),
    );
    return this.unwrap(result);
  }

  @Post('cards/:id/unsuspend')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Unsuspend a card — marks it as due immediately',
    description: 'Card state is restored to REVIEW and dueAt is set to now.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: ReviewCardResponse })
  @ApiResponse({ status: 404 })
  @ApiResponse({ status: 403 })
  async unsuspendCard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ReviewCardResponse> {
    const result: Result<ReviewCardDto, SrsApplicationError> = await this.commandBus.execute(
      new UnsuspendCardCommand(user.userId, id),
    );
    return this.unwrap(result);
  }

  // ─── Skip-known introduction (plan 21 §4) ────────────────────────────────────

  @Post('cards/introduce')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Introduce a single SRS card',
    description:
      'Idempotent: returns the existing card if one already exists for this content. ' +
      'Pass `seedKind` to seed the card directly in REVIEW (skip-known) instead of NEW — ' +
      'used by the per-vocabulary-list know/new tap-through and placement-test outcomes.',
  })
  @ApiResponse({ status: 200, type: ReviewCardResponse })
  @ApiResponse({ status: 429, description: 'Daily new-card limit reached (non-seeded only)' })
  async introduceCard(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: IntroduceCardRequest,
  ): Promise<ReviewCardResponse> {
    const result: Result<ReviewCardDto, SrsApplicationError> = await this.commandBus.execute(
      new IntroduceCardCommand(user.userId, body.contentType, body.contentId, body.seedKind),
    );
    return this.unwrap(result);
  }

  @Post('cards/bulk-introduce')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Introduce every item of a vocabulary list as SRS cards',
    description:
      'Pass `seedKind` to seed every card directly in REVIEW (skip-known) — used for the ' +
      '"skip all as known" shortcut on a vocabulary list. Omit to introduce items normally.',
  })
  @ApiResponse({ status: 200, type: BulkIntroduceResponse })
  async bulkIntroduce(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: BulkIntroduceRequest,
  ): Promise<BulkIntroduceResponse> {
    const result: Result<BulkIntroduceResult, Error> = await this.commandBus.execute(
      new BulkIntroduceFromVocabularyListCommand(user.userId, body.vocabularyListId, body.seedKind),
    );
    if (result.isFail) {
      throw new UnprocessableEntityException(result.error.message);
    }
    return result.value;
  }

  // ─── Error mapping ────────────────────────────────────────────────────────────

  private unwrap<T>(result: Result<T, SrsApplicationError>): T {
    if (result.isOk) return result.value;
    const err = result.error;
    if (err instanceof SrsCardNotFoundError) throw new NotFoundException(err.message);
    if (err instanceof SrsCardUnauthorizedError) throw new ForbiddenException(err.message);
    if (err instanceof SrsCardSuspendedError) throw new UnprocessableEntityException(err.message);
    if (err instanceof SrsNewCardLimitError || err instanceof SrsReviewLimitError) {
      throw new HttpException(err.message, HttpStatus.TOO_MANY_REQUESTS);
    }
    throw new UnprocessableEntityException((err as Error).message);
  }
}
