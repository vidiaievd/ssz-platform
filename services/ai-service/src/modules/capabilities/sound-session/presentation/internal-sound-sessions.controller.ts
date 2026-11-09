import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { AdmitSoundSessionCommand } from '../application/admit-sound-session/admit-sound-session.command.js';
import type { AdmitSoundSessionOutcome } from '../domain/sound-session.js';
import { AdmitSoundSessionRequestDto, AdmitSoundSessionResponseDto } from './sound-session.dto.js';

/** The pronunciation session's door (plan 86, step 14.1). Not routed by the gateway. */
@ApiTags('Internal — sound sessions')
@ApiHeader({ name: 'x-internal-token', required: true })
@ApiUnauthorizedResponse({ description: 'Missing or invalid x-internal-token' })
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/sound-sessions')
export class InternalSoundSessionsController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('admit')
  @HttpCode(200)
  @ApiOperation({
    summary: 'May a learner begin a pronunciation session, and what may it cost',
    description:
      "The payer's `ai.practice` through the gate (policy, tariff, credits), then the learner's sessions of the UTC " +
      'day (`AI_SOUND_SESSION_DAILY_LIMIT`, 3). Admitted with a budget — credits left and what a session is expected ' +
      'to cost — for the warning on the start; a small pool does not refuse. `resume` reopens a session already ' +
      'begun: not counted, refused only when the payer may not use `ai.practice` at all. Every outcome is a 200: ' +
      '`admitted`, `refused` (`session_limit` / `not_available` / `pool_empty`) or `failed` (`gate_unavailable`). ' +
      "The session's takes go to `sentence-checks` / `toneme-checks` with its `sessionId` (surface `pronunciation_session`).",
  })
  @ApiOkResponse({ type: AdmitSoundSessionResponseDto })
  async admit(@Body() body: AdmitSoundSessionRequestDto): Promise<AdmitSoundSessionResponseDto> {
    return this.commandBus.execute<AdmitSoundSessionCommand, AdmitSoundSessionOutcome>(
      new AdmitSoundSessionCommand({ userId: body.userId, schoolId: body.schoolId, resume: body.resume ?? false }),
    ) as Promise<AdmitSoundSessionResponseDto>;
  }
}
