import { BadRequestException, Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../common/guards/internal-auth.guard.js';
import { TextWordStresses, type Span } from '../application/text-word-stresses.js';
import { WordStressesRequestDto, WordStressesResponseDto } from './word-stresses.dto.js';

/** content-service's door to the lexicon's stresses under a text (plan 86, step 5b). Not routed by the gateway. */
@ApiTags('Internal — prosody')
@ApiHeader({ name: 'x-internal-token', required: true })
@ApiUnauthorizedResponse({ description: 'Missing or invalid x-internal-token' })
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/prosody/word-stresses')
export class InternalWordStressesController {
  constructor(private readonly stresses: TextWordStresses) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: "The lexicon's word stresses and sounds under a text",
    description:
      'For each word the caller counted: the stressed vowel in the word as written, its length and the toneme, and ' +
      'the word\'s letters laid over its sounds (step 6d), from NB Uttale, homographs narrowed by spaCy. No model is called and nothing is billed. Cached by a hash of the ' +
      'text and its spans for 7 days.',
  })
  @ApiOkResponse({ type: WordStressesResponseDto })
  @ApiBadRequestResponse({ description: 'A span is not two integers inside the text, in order' })
  async of(@Body() body: WordStressesRequestDto): Promise<WordStressesResponseDto> {
    const spans = parseSpans(body.spans, body.text.length);
    const analysed = await this.stresses.of(body.language, body.text, spans);
    return {
      words: analysed.flatMap(({ stress }, index) =>
        stress ? [{ index, toneme: stress.toneme, vowel: stress.vowel }] : [],
      ),
      sounds: analysed.flatMap(({ segs }, index) => (segs ? [{ index, segs }] : [])),
    };
  }
}

/** The caller's words, checked: two integers each, inside the text. Shared with the phrase marks (step 5c). */
export function parseSpans(raw: unknown[], length: number): Span[] {
  return raw.map((x, i) => {
    const ok =
      Array.isArray(x) &&
      x.length === 2 &&
      Number.isInteger(x[0]) &&
      Number.isInteger(x[1]) &&
      x[0] >= 0 &&
      x[0] < x[1] &&
      x[1] <= length;
    if (!ok) throw new BadRequestException(`spans[${i}] is not [start, end) inside the text`);
    return [x[0], x[1]] as const;
  });
}
