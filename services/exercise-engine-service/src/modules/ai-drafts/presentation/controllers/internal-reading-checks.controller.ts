import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { CheckReadingsQuery } from '../../application/queries/check-readings/check-readings.query.js';
import type { PromptCheckCount } from '../../domain/reading-verdict.js';
import { CheckReadingsDto } from '../dto/check-readings.dto.js';

/**
 * The reading check on what a speech model heard, with nothing stored and nothing ruled — for
 * ai-service's shadow run over teachers' verdicts (plan 82, step 10). Service-to-service only:
 * `x-internal-token`, not routed by the gateway. Callers must include the `/api/v1` prefix.
 *
 * A POST because the passages and transcripts are the input; it reads nothing and writes nothing.
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/reading-checks')
export class InternalReadingChecksController {
  constructor(private readonly queryBus: QueryBus) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async check(@Body() dto: CheckReadingsDto): Promise<{ prompts: PromptCheckCount[] }> {
    const prompts: PromptCheckCount[] = await this.queryBus.execute(
      new CheckReadingsQuery(
        dto.language,
        dto.passPercent,
        dto.prompts.map((p) => ({ itemId: p.itemId, text: p.text, transcript: p.transcript })),
      ),
    );
    return { prompts };
  }
}
