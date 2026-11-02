import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { MakeReferenceClipCommand } from '../application/make-reference-clip/make-reference-clip.command.js';
import type { ReferenceClipOutcome } from '../domain/reference-clip.js';
import { ReferenceClipRequestDto, ReferenceClipResponseDto, toResponse } from './reference-clip.dto.js';

/** media-service's door to a self-checked reference clip (plan 88, step 6b.2). Not routed by the gateway. */
@ApiTags('Internal — reference clips')
@ApiHeader({ name: 'x-internal-token', required: true })
@ApiUnauthorizedResponse({ description: 'Missing or invalid x-internal-token' })
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/reference-clips')
export class InternalReferenceClipsController {
  constructor(private readonly commandBus: CommandBus) {}

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
}
