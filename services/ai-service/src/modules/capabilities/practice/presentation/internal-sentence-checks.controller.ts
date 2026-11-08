import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { SentenceCheckCommand } from '../application/sentence-check/sentence-check.command.js';
import type { SentenceCheckOutcome } from '../application/sentence-check/sentence-check.handler.js';
import { SentenceCheckRequestDto, SentenceCheckResponseDto } from './sentence-check.dto.js';

/** A reading's sentence drill: one take of one sentence (plan 86, step 6g). Not routed by the gateway. */
@ApiTags('Internal — sentence checks')
@ApiHeader({ name: 'x-internal-token', required: true })
@ApiUnauthorizedResponse({ description: 'Missing or invalid x-internal-token' })
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/sentence-checks')
export class InternalSentenceChecksController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: "Hear a learner's take of one sentence of a reading",
    description:
      'The same hearing as a rehearsed passage (`practice_voice`, then `pronunciation_explain` for the weak ' +
      "sounds), for one sentence: the words heard with timings and scores, the sound remarks, in the contract's " +
      '`AiFeedback` shape — passage 0 is the sentence. Sold under `ai.practice` (the school pays, or the learner ' +
      'without one; surface `pronunciation_drill`). Outside the per-exercise and monthly-learner limits of the ' +
      'rehearsal; its own limit is tries per sentence per UTC day. Every outcome is a 200: `ok`, `refused` or ' +
      '`failed`. Nothing is written but the ledger. ' +
      "A pronunciation session's take (plan 86, step 13.3) adds `target { atomId, words, context, explained }`: the " +
      'answer then carries `target { measured, passed, weakest, explained }` — our verdict by the native thresholds ' +
      'on the target words only; a miss whose `weakest.key` is in `explained` is not sent to the model again.',
  })
  @ApiOkResponse({ type: SentenceCheckResponseDto })
  async check(@Body() body: SentenceCheckRequestDto): Promise<SentenceCheckResponseDto> {
    return this.commandBus.execute<SentenceCheckCommand, SentenceCheckOutcome>(
      new SentenceCheckCommand({
        schoolId: body.schoolId,
        userId: body.userId,
        exerciseId: body.exerciseId ?? null,
        language: body.language,
        explanationLanguage: body.explanationLanguage ?? null,
        sentence: body.sentence,
        recordingAssetId: body.recordingAssetId,
        target: body.target
          ? { atomId: body.target.atomId, words: body.target.words, context: body.target.context, explained: body.target.explained ?? [] }
          : null,
      }),
    ) as Promise<SentenceCheckResponseDto>;
  }
}
