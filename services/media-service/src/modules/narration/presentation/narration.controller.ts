import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { AppConfig } from '../../../config/configuration.js';
import { VOICE_RESOLVER } from '../../../shared/application/ports/speech-synthesizer.port.js';
import type { IVoiceResolver } from '../../../shared/application/ports/speech-synthesizer.port.js';
import { isAuthor } from '../../../common/authoring-roles.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../infrastructure/auth/jwt-verifier.service.js';
import { speakerVoicesOf } from '../domain/speaker-voices.js';
import { RequestNarrationCommand } from '../application/commands/request-narration/request-narration.command.js';
import type { RequestNarrationOutcome } from '../application/commands/request-narration/request-narration.command.js';
import {
  DEFAULT_PAUSE_SCALE,
  LENGTH_SCALE_RANGE,
  LEVEL_LENGTH_SCALE,
  PAUSE_SCALE_RANGE,
} from '../domain/narration-style.js';
import { NarrationDefaultsResponseDto, RequestNarrationDto, RequestNarrationResponseDto } from './dto/narration.dto.js';

@ApiTags('narration')
@ApiBearerAuth()
@Controller('media/narration')
export class NarrationController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly config: ConfigService<AppConfig>,
    @Inject(VOICE_RESOLVER) private readonly voices: IVoiceResolver,
  ) {}

  @Get('defaults')
  @ApiOperation({
    summary: 'Default narration pace and pauses per course level',
    description:
      'What an author gets without choosing: a slower pace for a beginner, a faster one for an advanced ' +
      'learner. The editor shows these as the starting point and for its reset button, together with the ' +
      'range each setting accepts.',
  })
  @ApiResponse({ status: 200, type: NarrationDefaultsResponseDto })
  defaults(@Query('lang') lang = 'nb'): NarrationDefaultsResponseDto {
    const tts = this.config.get<AppConfig['tts']>('tts')!;
    return {
      fallback: { lengthScale: tts.narrationLengthScale, pauseScale: DEFAULT_PAUSE_SCALE },
      byLevel: Object.fromEntries(
        Object.entries(LEVEL_LENGTH_SCALE).map(([level, lengthScale]) => [
          level,
          { lengthScale, pauseScale: DEFAULT_PAUSE_SCALE },
        ]),
      ),
      voices: this.voices.list(lang).map((voice, index) => ({
        id: voice.id,
        name: voice.name,
        gender: voice.gender,
        isDefault: index === 0,
      })),
      min: { lengthScale: LENGTH_SCALE_RANGE.min, pauseScale: PAUSE_SCALE_RANGE.min },
      max: { lengthScale: LENGTH_SCALE_RANGE.max, pauseScale: PAUSE_SCALE_RANGE.max },
    };
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Narrate a lesson body with speech synthesis',
    description:
      'Builds the narration script from the markdown (no media tokens, no markup, no speaker ' +
      'names), creates a SYNTHESIZED `lesson_asset` owned by the caller and queues the ' +
      'synthesis. Returns at once; the asset turns READY once spoken and processed, or FAILED.',
  })
  @ApiResponse({ status: 202, type: RequestNarrationResponseDto })
  @ApiResponse({ status: 403, description: 'The caller does not author lessons' })
  @ApiResponse({ status: 422, description: 'Nothing to read, text too long, or unsupported language' })
  async narrate(
    @Body() dto: RequestNarrationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RequestNarrationResponseDto> {
    if (!isAuthor(user.roles)) {
      throw new ForbiddenException('Only lesson authors can request a narration');
    }

    const result: RequestNarrationOutcome = await this.commandBus.execute(
      new RequestNarrationCommand(user.userId, dto.bodyMarkdown, dto.lang ?? 'nb', dto.label ?? null,
        dto.lessonId ?? null,
        dto.level ?? null,
        dto.lengthScale ?? null,
        dto.pauseScale ?? null,
        dto.voiceId ?? null,
        speakerVoicesOf(dto.speakerVoices),
      ),
    );
    if (result.isFail) throw new UnprocessableEntityException(result.error);

    return result.value;
  }
}
