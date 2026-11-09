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
      'Asks the `practice` agent about the subject — `practice_voice` for a `read_aloud`, one call per ' +
      'passage — with the school as payer (`ai.practice`, surface `precheck`), and answers in the ' +
      '`AiFeedback` shape: hints for a text, the words heard for a reading. The school\'s limits sent in the ' +
      'body (checks per learner and exercise, credits per learner per month) are counted from the ledger first. ' +
      'The attempt is not touched and no event is published; only the ledger rows are written. Every outcome ' +
      'is a 200: `ok`, `refused` (nothing to ask, a limit reached, the pool spent, not available to the school) ' +
      'or `failed` (no usable answer), each with what the limits leave.',
  })
  @ApiOkResponse({ type: PrecheckResponseDto })
  precheck(@Body() body: PrecheckRequestDto): Promise<PrecheckOutcome> {
    return this.commandBus.execute(
      new PrecheckCommand({
        schoolId: body.schoolId,
        userId: body.userId,
        exerciseId: body.exerciseId,
        attemptId: body.attemptId,
        courseId: body.courseId ?? null,
        subject: body.subject,
        limits: { perExercise: body.limits.perExercise, perLearnerMonthlyCredits: body.limits.perLearnerMonthlyCredits },
      }),
    );
  }
}
