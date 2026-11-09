import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { parseSpans } from '../../../pronunciation/presentation/internal-word-stresses.controller.js';
import { SuggestPhraseMarksCommand } from '../application/suggest-phrase-marks/suggest-phrase-marks.command.js';
import type { PhraseMarksOutcome } from '../application/suggest-phrase-marks/suggest-phrase-marks.handler.js';
import { PhraseMarksRequestDto, PhraseMarksResponseDto } from './phrase-marks.dto.js';

/** content-service's door to a suggestion of phrase marks for the prosody editor (plan 86, step 5c). Not routed by the gateway. */
@ApiTags('Internal — prosody')
@ApiHeader({ name: 'x-internal-token', required: true })
@ApiUnauthorizedResponse({ description: 'Missing or invalid x-internal-token' })
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/prosody/phrase-marks')
export class InternalPhraseMarksController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Suggest the phrase marks of a text',
    description:
      'A language model (`prosody_markup`, sold under `ai.authoring`: the school pays, or the author without one; ' +
      'surface `authoring`) splits the text into intonation groups and gives, by the index of the caller’s words, ' +
      'each group’s end with its pitch and pause, its phrase accent, and the words linked to the next. Word stress ' +
      'and toneme are not asked for — they are the lexicon’s. At most 1 500 words. Every outcome is a 200: `ok`, ' +
      '`refused` or `failed`. Nothing is stored: the editor shows the suggestion for the teacher to fix and save.',
  })
  @ApiOkResponse({ type: PhraseMarksResponseDto })
  @ApiBadRequestResponse({ description: 'A span is not two integers inside the text, in order' })
  async suggest(@Body() body: PhraseMarksRequestDto): Promise<PhraseMarksResponseDto> {
    return this.commandBus.execute<SuggestPhraseMarksCommand, PhraseMarksOutcome>(
      new SuggestPhraseMarksCommand({
        schoolId: body.schoolId,
        userId: body.userId,
        language: body.language,
        text: body.text,
        spans: parseSpans(body.spans, body.text.length),
      }),
    );
  }
}
