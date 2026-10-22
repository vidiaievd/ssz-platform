import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { PlatformAdminGuard } from '../../../../common/guards/platform-admin.guard.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { enabledAspects } from '../domain/review-aspect.js';
import { TryTranslateReviewCommand } from '../application/try-translate-review.command.js';
import type { TryReviewResult } from '../application/try-translate-review.handler.js';
import { TryReviewResponseDto, TryTranslateReviewDto } from './try-review.dto.js';

@ApiTags('Admin — review draft')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Caller is not platform_admin' })
@UseGuards(PlatformAdminGuard)
@Controller('admin/ai/review-draft')
export class AdminReviewDraftController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('translate/try')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Draft a review of a pasted translate submission',
    description:
      'Runs the `review_draft` prompt version named on the binding over a submission sent in the body, ' +
      'and returns the draft a teacher would get. Nothing is stored except the ledger row. Every model ' +
      'outcome is a 200; an answer quoting text the learner did not write is `invalid_response`.',
  })
  @ApiOkResponse({ type: TryReviewResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'Every check is off' })
  tryTranslate(@Body() body: TryTranslateReviewDto, @CurrentUser() user: AuthenticatedUser): Promise<TryReviewResult> {
    return this.commandBus.execute(
      new TryTranslateReviewCommand(
        {
          langs: body.langs,
          commentLanguage: body.commentLanguage,
          aspects: enabledAspects(body.checks),
          sentences: body.sentences.map((s, i) => ({
            itemId: s.itemId ?? `s${i + 1}`,
            direction: s.direction,
            source: s.source,
            refs: s.refs,
            answer: s.answer,
            ...(s.explanation ? { explanation: s.explanation } : {}),
            ...(s.teacherNote ? { teacherNote: s.teacherNote } : {}),
          })),
        },
        user.userId,
        body.asPayer ?? null,
      ),
    );
  }
}
