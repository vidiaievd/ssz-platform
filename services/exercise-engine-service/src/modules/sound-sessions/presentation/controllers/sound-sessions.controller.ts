import {
  Body,
  Controller,
  HttpCode,
  InternalServerErrorException,
  Post,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import type { Result } from '../../../../shared/kernel/result.js';
import { StartSoundSessionCommand } from '../../application/commands/start-sound-session/start-sound-session.command.js';
import type { StartSoundSessionError } from '../../application/commands/start-sound-session/start-sound-session.handler.js';
import type { SoundSessionView } from '../../application/session-view.js';
import { SoundSessionResponseDto, StartSoundSessionRequestDto } from '../dto/sound-session.dto.js';

/** The pronunciation session — the «speech therapist» of plan 86, step 13.4. */
@ApiTags('sound-sessions')
@ApiBearerAuth()
@Controller('sound-sessions')
export class SoundSessionsController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Begin a pronunciation session, or resume the open one',
    description:
      'One open session per learner. An open one is handed back when it can go on (its probe alive, the same ' +
      'language, the same chosen sound); otherwise it is abandoned and a new one begins. The sounds: the chosen ' +
      'one, else due `SOUND_ATOM` cards, sounds flagged in 14 days, cards not yet due; with no record at all the ' +
      'session opens with a diagnostic, one word per family (plan 86 Q31, §5.5a). The session is a probe of the ' +
      "engine's own template `sound_session`, answered by an ordinary attempt.",
  })
  @ApiResponse({ status: 200, type: SoundSessionResponseDto })
  @ApiResponse({ status: 400, description: 'language or atomId malformed' })
  @ApiResponse({ status: 422, description: '`SOUND_NOT_DRILLABLE` (the chosen sound has no material) or `NO_MATERIAL`' })
  @ApiResponse({ status: 503, description: '`SOURCE_UNAVAILABLE`: learning-service or content-service did not answer' })
  async start(
    @Body() dto: StartSoundSessionRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SoundSessionView> {
    const result = await this.commandBus.execute<
      StartSoundSessionCommand,
      Result<SoundSessionView, StartSoundSessionError>
    >(new StartSoundSessionCommand(user.userId, dto.language, dto.atomId ?? null));
    if (result.isOk) return result.value;

    const error = result.error;
    switch (error.code) {
      case 'SOURCE_UNAVAILABLE':
        throw new ServiceUnavailableException({ code: error.code, source: error.source, message: `${error.source} is unavailable` });
      case 'SOUND_NOT_DRILLABLE':
        throw new UnprocessableEntityException({ code: error.code, atomId: error.atomId, message: 'This sound cannot be drilled' });
      case 'NO_MATERIAL':
        throw new UnprocessableEntityException({ code: error.code, message: `No sound of ${error.language} can be drilled` });
      case 'START_FAILED':
        throw new InternalServerErrorException({ code: error.code, message: 'The session could not be started' });
    }
  }
}
