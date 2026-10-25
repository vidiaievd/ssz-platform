import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import type { AppConfig } from '../../../../config/configuration.js';
import { AcceptAiVerdictsAtTermCommand } from '../../application/commands/accept-ai-verdicts-at-term/accept-ai-verdicts-at-term.command.js';
import type { AcceptAiVerdictsAtTermResult } from '../../application/commands/accept-ai-verdicts-at-term/accept-ai-verdicts-at-term.handler.js';

/**
 * One pass of the term job on demand (plan 80, step 4), for an operator — and for a check
 * that should not wait for the timer. Service-to-service only: `x-internal-token`, not
 * routed by the gateway. Callers must include the `/api/v1` prefix.
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/review-terms')
export class InternalReviewTermsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  @Post('run')
  @HttpCode(HttpStatus.OK)
  async run(): Promise<AcceptAiVerdictsAtTermResult> {
    const { batch } = this.config.get<AppConfig['reviewTerms']>('reviewTerms')!;
    return this.commandBus.execute(new AcceptAiVerdictsAtTermCommand(new Date(), batch));
  }
}
