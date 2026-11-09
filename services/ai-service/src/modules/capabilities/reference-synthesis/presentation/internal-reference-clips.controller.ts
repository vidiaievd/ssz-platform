import { Body, Controller, HttpCode, Logger, Post, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { MakeReferenceClipCommand } from '../application/make-reference-clip/make-reference-clip.command.js';
import { CheckReferenceWordsQuery } from '../application/check-reference-words/check-reference-words.query.js';
import type { ReferenceClipOutcome, ReferenceWordCheck } from '../domain/reference-clip.js';
import {
  ReferenceClipRequestDto,
  ReferenceClipResponseDto,
  ReferenceWordsCheckRequestDto,
  ReferenceWordsCheckResponseDto,
  toResponse,
} from './reference-clip.dto.js';

/** media-service's door to a self-checked reference clip (plan 88, step 6b.2). Not routed by the gateway. */
@ApiTags('Internal — reference clips')
@ApiHeader({ name: 'x-internal-token', required: true })
@ApiUnauthorizedResponse({ description: 'Missing or invalid x-internal-token' })
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/reference-clips')
export class InternalReferenceClipsController {
  private readonly logger = new Logger(InternalReferenceClipsController.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Synthesize a reference word and check its toneme',
    description:
      'Speaks the word in a carrier sentence (`reference_synthesis`, Azure TTS), voice by voice, hears each clip ' +
      'back (`reference_check`, Pronunciation Assessment), names its sounds by the lexicon and measures the stressed ' +
      "vowel's F0 against the lexicon's toneme. The first clip that agrees is returned; a word whose variants differ " +
      'in toneme is not synthesized. The platform pays (surface `authoring`). Every outcome is a 200: `ok` (the clip), ' +
      '`rejected` (no voice agreed), `refused` (nothing to synthesize or check against) or `failed` (a model or the ' +
      'pitch tracker did not answer). Nothing is stored here: the caller keeps the clip.',
  })
  @ApiOkResponse({ type: ReferenceClipResponseDto })
  async make(@Body() body: ReferenceClipRequestDto): Promise<ReferenceClipResponseDto> {
    const outcome = await this.commandBus.execute<MakeReferenceClipCommand, ReferenceClipOutcome>(
      new MakeReferenceClipCommand({ language: body.language, word: body.word }),
    );
    return toResponse(outcome);
  }

  @Post('check')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Which words could get a reference clip, without synthesizing anything',
    description:
      'The refusals made before synthesis, for many words from one lexicon read (plan 86, step 13.2c): `not_a_word`, ' +
      '`language_not_supported`, `not_in_lexicon`, `tone_ambiguous` (variants differ in toneme — the context-free ' +
      'reading of the lexicon, unlike word-stresses). `ok` does not promise a clip: whether a voice passes the ' +
      'self-check shows only when synthesized. No model is called, nothing is billed.',
  })
  @ApiOkResponse({ type: ReferenceWordsCheckResponseDto })
  @ApiServiceUnavailableResponse({ description: 'The lexicon could not be read' })
  async check(@Body() body: ReferenceWordsCheckRequestDto): Promise<ReferenceWordsCheckResponseDto> {
    let words: ReferenceWordCheck[];
    try {
      words = await this.queryBus.execute<CheckReferenceWordsQuery, ReferenceWordCheck[]>(
        new CheckReferenceWordsQuery({ language: body.language, words: body.words }),
      );
    } catch (err) {
      this.logger.warn(`Reference words not checked: ${err instanceof Error ? err.message : String(err)}`);
      throw new ServiceUnavailableException('lexicon_unavailable');
    }
    return { words };
  }
}
