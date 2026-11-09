import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../common/guards/internal-auth.guard.js';
import {
  InternalPronounceClipDto,
  PronounceClipResponseDto,
  ReferenceClipDto,
  ReferenceClipResponseDto,
} from './dto/pronounce.dto.js';
import { PronunciationClipService } from './pronunciation-clip.service.js';
import { ReferenceClipService } from './reference-clip.service.js';

// Service-to-service only: @Public() exempts the route from the global JWT guard,
// InternalAuthGuard demands 'x-internal-token'. Not routed by the gateway.
@ApiTags('internal')
@ApiHeader({ name: 'x-internal-token', required: true, description: 'Shared service token' })
@ApiResponse({ status: 401, description: 'Missing or wrong x-internal-token' })
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/media/pronunciation')
export class InternalPronunciationController {
  constructor(
    private readonly clips: PronunciationClipService,
    private readonly references: ReferenceClipService,
  ) {}

  @Post('clip')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Synthesize a word as an exercise asset on an owner's behalf (course seeds)",
    description:
      'What POST /media/pronunciation/clip does for an author, for the clips of a seeded course ' +
      '(plan 86, step 12.3): there is no user token, so the owner is named in the body. The caller ' +
      'has already checked the owner may author the exercise. Each call makes a new asset.',
  })
  @ApiResponse({ status: 200, type: PronounceClipResponseDto })
  @ApiResponse({ status: 422, description: 'Empty text, text too long, unsupported language or asset refused' })
  @ApiResponse({ status: 503, description: 'Speech synthesis is unavailable' })
  async clip(@Body() dto: InternalPronounceClipDto): Promise<PronounceClipResponseDto> {
    const result = await this.clips.createAsset(dto.ownerId, dto.text, dto.lang ?? 'nb', dto.exerciseId ?? null);

    if (result.isFail) {
      if (result.error === 'SYNTHESIS_FAILED') {
        throw new ServiceUnavailableException('Speech synthesis is unavailable');
      }
      throw new UnprocessableEntityException(result.error);
    }

    return result.value;
  }

  @Post('reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get the self-checked reference clip of a word for platform material (drill scripts)',
    description:
      'What POST /media/pronunciation/reference does for an author, for the words of the pronunciation ' +
      "drill (plan 86, step 13.2c): content-service's reference script has no user token. Same clip, same " +
      'cache and the same refusals; the platform pays for the synthesis either way.',
  })
  @ApiResponse({ status: 200, type: ReferenceClipResponseDto })
  @ApiResponse({
    status: 422,
    description:
      'EMPTY_TEXT, NOT_A_WORD, LANGUAGE_NOT_SUPPORTED, NOT_IN_LEXICON, TONE_AMBIGUOUS, REFERENCE_REJECTED or ' +
      'ASSET_REJECTED — the code is the message',
  })
  @ApiResponse({ status: 503, description: 'NOT_AVAILABLE or SYNTHESIS_FAILED — worth asking again later' })
  async reference(@Body() dto: ReferenceClipDto): Promise<ReferenceClipResponseDto> {
    const result = await this.references.getOrCreate(dto.text, dto.lang ?? 'nb');

    if (result.isFail) {
      if (result.error === 'SYNTHESIS_FAILED' || result.error === 'NOT_AVAILABLE') {
        throw new ServiceUnavailableException(result.error);
      }
      throw new UnprocessableEntityException(result.error);
    }

    return result.value;
  }
}
