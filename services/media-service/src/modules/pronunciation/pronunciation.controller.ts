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

import { PronounceDto, PronounceResponseDto } from './dto/pronounce.dto.js';
import { PronunciationService } from './pronunciation.service.js';

@ApiTags('pronunciation')
@ApiBearerAuth()
@Controller('media/pronunciation')
export class PronunciationController {
  constructor(private readonly pronunciation: PronunciationService) {}

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
}
