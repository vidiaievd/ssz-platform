import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { CheckTonemeCommand } from '../application/check-toneme/check-toneme.command.js';
import type { TonemeCheckOutcome } from '../domain/toneme-check.js';
import { TonemeCheckRequestDto, TonemeCheckResponseDto } from './toneme-check.dto.js';

/** A pronunciation drill's door to a toneme check (plan 88, step 8.3, Q15). Not routed by the gateway. */
@ApiTags('Internal — toneme checks')
@ApiHeader({ name: 'x-internal-token', required: true })
@ApiUnauthorizedResponse({ description: 'Missing or invalid x-internal-token' })
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/toneme-checks')
export class InternalTonemeChecksController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: "Compare a learner's toneme of a word with its reference clip",
    description:
      "The learner said the reference's carrier sentence (*«Nå sier jeg bønner igjen.»*). The take is heard by " +
      'Pronunciation Assessment (`toneme_check`, sold under `ai.practice`: the school pays, or the learner without ' +
      "one; surface `pronunciation_drill`), the word's sounds are named by the lexicon and the stressed vowel's F0 " +
      "is compared with the reference's stored score. `other_tone` only when the take is past the learner's bounds " +
      '(< 0.5 / > 3.5) on the other side and at least 3 semitones from the reference — say «listen to the reference», ' +
      'never «wrong». Both melodies come back whatever the verdict. Every outcome is a 200: `ok`, `unheard` (the word ' +
      'or its toneme could not be read off the take), `refused` or `failed`. Nothing is written but the ledger.',
  })
  @ApiOkResponse({ type: TonemeCheckResponseDto })
  async check(@Body() body: TonemeCheckRequestDto): Promise<TonemeCheckResponseDto> {
    return this.commandBus.execute<CheckTonemeCommand, TonemeCheckOutcome>(
      new CheckTonemeCommand({
        schoolId: body.schoolId,
        userId: body.userId,
        language: body.language,
        word: body.word,
        recordingAssetId: body.recordingAssetId,
        referenceAssetId: body.referenceAssetId,
        sessionId: body.sessionId ?? null,
      }),
    );
  }
}
