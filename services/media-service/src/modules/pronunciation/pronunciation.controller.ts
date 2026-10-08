import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../infrastructure/auth/jwt-verifier.service.js';
import { PronounceClipDto, PronounceClipResponseDto, PronounceDto, PronounceResponseDto } from './dto/pronounce.dto.js';
import { PronunciationClipService } from './pronunciation-clip.service.js';
import { PronunciationService } from './pronunciation.service.js';

@ApiTags('pronunciation')
@ApiBearerAuth()
@Controller('media/pronunciation')
export class PronunciationController {
  constructor(
    private readonly pronunciation: PronunciationService,
    private readonly clips: PronunciationClipService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a pronunciation clip for a word',
    description:
      'Returns the public URL of an mp3 pronunciation, synthesizing it on first request and ' +
      'serving the stored clip afterwards. Independent of whatever voices the caller’s ' +
      'browser happens to have.',
  })
  @ApiResponse({ status: 200, type: PronounceResponseDto })
  @ApiResponse({ status: 422, description: 'Empty text, text too long, or unsupported language' })
  @ApiResponse({ status: 503, description: 'Speech synthesis is unavailable' })
  async pronounce(@Body() dto: PronounceDto): Promise<PronounceResponseDto> {
    const result = await this.pronunciation.getOrCreate(dto.text, dto.lang ?? 'nb');

    if (result.isFail) {
      if (result.error === 'SYNTHESIS_FAILED') {
        throw new ServiceUnavailableException('Speech synthesis is unavailable');
      }
      throw new UnprocessableEntityException(result.error);
    }

    return result.value;
  }

  @Post('clip')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Synthesize a word as an exercise asset',
    description:
      'Same synthesis and cache as the plain pronunciation route, but the audio becomes a new ' +
      '`exercise_asset` owned by the caller, so a document can hold its id. The asset turns READY ' +
      'once processing has measured it. The route does not judge whether synthesis is appropriate ' +
      'for the word — that is a property of the document, checked by its preflight.',
  })
  @ApiResponse({ status: 200, type: PronounceClipResponseDto })
  @ApiResponse({ status: 422, description: 'Empty text, text too long, unsupported language or asset refused' })
  @ApiResponse({ status: 503, description: 'Speech synthesis is unavailable' })
  async clip(
    @Body() dto: PronounceClipDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PronounceClipResponseDto> {
    const result = await this.clips.createAsset(user.userId, dto.text, dto.lang ?? 'nb', dto.exerciseId ?? null);

    if (result.isFail) {
      if (result.error === 'SYNTHESIS_FAILED') {
        throw new ServiceUnavailableException('Speech synthesis is unavailable');
      }
      throw new UnprocessableEntityException(result.error);
    }

    return result.value;
  }
}
