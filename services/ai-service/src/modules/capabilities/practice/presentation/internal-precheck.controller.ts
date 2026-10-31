import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { PrecheckCommand } from '../application/precheck/precheck.command.js';
import type { PrecheckOutcome } from '../application/precheck/precheck.handler.js';
import { PrecheckRequestDto, PrecheckResponseDto } from './precheck.dto.js';

/** exercise-engine's door to a rehearsal (plan 84, step 2). Not routed by the gateway. */
@ApiTags('Internal — precheck')
@ApiHeader({ name: 'x-internal-token', required: true })
@ApiUnauthorizedResponse({ description: 'Missing or invalid x-internal-token' })
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/precheck')
export class InternalPrecheckController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Check work in progress before hand-in',
    description:
      'Asks the `practice` agent about the subject, with the school as payer (`ai.practice`, surface ' +
      '`precheck`), and answers with hints in the `AiFeedback` shape. The attempt is not touched and no ' +
      'event is published; only the ledger row is written. Every outcome is a 200: `ok`, `refused` ' +
      '(nothing to ask, not available to the school, credits spent) or `failed` (no usable answer).',
  })
  @ApiOkResponse({ type: PrecheckResponseDto })
  precheck(@Body() body: PrecheckRequestDto): Promise<PrecheckOutcome> {
    return this.commandBus.execute(
      new PrecheckCommand({
        schoolId: body.schoolId,
        userId: body.userId,
        exerciseId: body.exerciseId,
        attemptId: body.attemptId,
        subject: body.subject,
      }),
    );
  }
}
