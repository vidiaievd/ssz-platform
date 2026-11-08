import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  InternalServerErrorException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import type { Result } from '../../../../shared/kernel/result.js';
import { StartSoundSessionCommand } from '../../application/commands/start-sound-session/start-sound-session.command.js';
import type {
  StartedSoundSession,
  StartSoundSessionError,
} from '../../application/commands/start-sound-session/start-sound-session.handler.js';
import { RecordSoundTakeCommand } from '../../application/commands/record-sound-take/record-sound-take.command.js';
import type {
  RecordSoundTakeError,
  RecordSoundTakeResult,
} from '../../application/commands/record-sound-take/record-sound-take.handler.js';
import { SubmitSoundSessionCommand } from '../../application/commands/submit-sound-session/submit-sound-session.command.js';
import type {
  SubmitSoundSessionError,
  SubmitSoundSessionResult,
} from '../../application/commands/submit-sound-session/submit-sound-session.handler.js';
import { GetSoundSessionItemsQuery } from '../../application/queries/get-sound-session-items/get-sound-session-items.query.js';
import type { SoundSessionItems } from '../../application/queries/get-sound-session-items/get-sound-session-items.handler.js';
import type { LoadSessionError } from '../../application/session-loader.js';
import {
  SoundSessionItemsResponseDto,
  SoundSessionLocaleQueryDto,
  SoundSessionResponseDto,
  SoundTakeRequestDto,
  StartSoundSessionResponseDto,
  SoundTakeResponseDto,
  StartSoundSessionRequestDto,
  SubmitSoundSessionResponseDto,
} from '../dto/sound-session.dto.js';

/** The pronunciation session — the «speech therapist» of plan 86, step 13.4. */
@ApiTags('sound-sessions')
@ApiBearerAuth()
@Controller('sound-sessions')
export class SoundSessionsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Begin a pronunciation session, or resume the open one',
    description:
      'One open session per learner. An open one is handed back when it can go on (its probe alive, the same ' +
      'language, the same chosen sound); otherwise it is abandoned and a new one begins. The sounds: the chosen ' +
      'one, else due `SOUND_ATOM` cards, sounds flagged in 14 days, cards not yet due; with no record at all the ' +
      'session opens with a diagnostic, one word per family (plan 86 Q31, §5.5a). The session is a probe of the ' +
      "engine's own template `sound_session`, answered by an ordinary attempt. A new session passes ai-service's " +
      "door first (plan 86, step 14.1): the learner's sessions of the UTC day (3) and the payer's `ai.practice`. " +
      '`budget` — credits left and what a session is expected to cost — is for a warning, never a refusal (§5.5a).',
  })
  @ApiResponse({ status: 200, type: StartSoundSessionResponseDto })
  @ApiResponse({ status: 400, description: 'language or atomId malformed' })
  @ApiResponse({ status: 403, description: "`NOT_AVAILABLE` — the payer's plan has no `ai.practice` (or AI is switched off)" })
  @ApiResponse({
    status: 422,
    description:
      '`SOUND_NOT_DRILLABLE` (the chosen sound has no material), `NO_MATERIAL`, `SESSION_LIMIT` (the day’s sessions are ' +
      'begun; `retryAfterMs` to the next UTC day) or `POOL_EMPTY` (the credits of the month are spent)',
  })
  @ApiResponse({ status: 503, description: '`SOURCE_UNAVAILABLE`: learning-, content- or ai-service did not answer' })
  async start(
    @Body() dto: StartSoundSessionRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StartedSoundSession> {
    const result = await this.commandBus.execute<
      StartSoundSessionCommand,
      Result<StartedSoundSession, StartSoundSessionError>
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
      case 'SESSION_LIMIT':
        throw new UnprocessableEntityException({
          code: error.code,
          retryAfterMs: error.retryAfterMs,
          message: "Today's pronunciation sessions are used up",
        });
      case 'POOL_EMPTY':
        throw new UnprocessableEntityException({ code: error.code, message: "This month's AI credits are spent" });
      case 'NOT_AVAILABLE':
        throw new ForbiddenException({ code: error.code, message: 'Pronunciation sessions are not part of this plan' });
      case 'START_FAILED':
        throw new InternalServerErrorException({ code: error.code, message: 'The session could not be started' });
    }
  }

  @Get(':attemptId/items')
  @ApiOperation({
    summary: 'The step in front of the learner, with its clips and instruction',
    description:
      'What to say now (`session.step`: the word in its carrier frame, a pair, or a course line), the reference clips ' +
      'of the step as signed links, and the base of the sound in the asked locale (none in the diagnostic, which ' +
      'measures cold). Read at every step: the links expire. Clips and instruction are best effort.',
  })
  @ApiResponse({ status: 200, type: SoundSessionItemsResponseDto })
  @ApiResponse({ status: 404, description: '`SESSION_NOT_FOUND` — no such session of this learner' })
  async items(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Query() query: SoundSessionLocaleQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SoundSessionItems> {
    const result = await this.queryBus.execute<GetSoundSessionItemsQuery, Result<SoundSessionItems, LoadSessionError>>(
      new GetSoundSessionItemsQuery(attemptId, user.userId, query.locale ?? 'en'),
    );
    if (result.isOk) return result.value;
    throw loadError(result.error);
  }

  @Post(':attemptId/takes')
  @HttpCode(200)
  @ApiOperation({
    summary: 'A take of the current step',
    description:
      'The recording is checked (this learner’s, made for this attempt, uploaded), heard by ai-service as the step ' +
      'says — the target sound of a word or line (`sentence-checks`), or a toneme against its reference ' +
      '(`toneme-checks`) — and the session moves. A heard take is deleted at once. `retry` changes nothing: record ' +
      'the same step again (a recording still uploading is a retry). `stopped` — the payer may not go on; hand in.',
  })
  @ApiResponse({ status: 200, type: SoundTakeResponseDto })
  @ApiResponse({ status: 404, description: '`SESSION_NOT_FOUND`' })
  @ApiResponse({ status: 409, description: '`SESSION_CLOSED` (handed in, done, expired) or `STALE_TAKE` with the current `takeIndex`' })
  @ApiResponse({ status: 422, description: '`RECORDING_NOT_FOUND` / `RECORDING_FAILED`' })
  @ApiResponse({ status: 503, description: '`MEDIA_UNAVAILABLE`' })
  async take(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: SoundTakeRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RecordSoundTakeResult> {
    const result = await this.commandBus.execute<RecordSoundTakeCommand, Result<RecordSoundTakeResult, RecordSoundTakeError>>(
      new RecordSoundTakeCommand(attemptId, user.userId, dto.recordingAssetId, dto.takeIndex, dto.explanationLanguage ?? null),
    );
    if (result.isOk) return result.value;

    const error = result.error;
    switch (error.code) {
      case 'SESSION_CLOSED':
        throw new ConflictException({ code: error.code, message: 'This session no longer takes recordings' });
      case 'STALE_TAKE':
        throw new ConflictException({ code: error.code, takeIndex: error.takeIndex, message: 'The session has moved past this step' });
      case 'RECORDING_NOT_FOUND':
        throw new UnprocessableEntityException({ code: error.code, message: 'No recording of this session by that id' });
      case 'RECORDING_FAILED':
        throw new UnprocessableEntityException({ code: error.code, message: 'The recording was refused when it was uploaded — record it again' });
      case 'MEDIA_UNAVAILABLE':
        throw new ServiceUnavailableException({ code: error.code, message: 'media-service is unavailable' });
      default:
        throw loadError(error);
    }
  }

  @Post(':attemptId/submit')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Hand the session in',
    description:
      'Stops the session where it stands unless it is done, and sums it up: the attempt is scored from the state the ' +
      'engine recorded (never from the body) and its event published. Each sound’s rating (Q28) is in `sounds`.',
  })
  @ApiResponse({ status: 200, type: SubmitSoundSessionResponseDto })
  @ApiResponse({ status: 404, description: '`SESSION_NOT_FOUND`' })
  @ApiResponse({ status: 409, description: '`SESSION_CLOSED` — already handed in or abandoned' })
  @ApiResponse({ status: 422, description: '`SUBMIT_FAILED` — the hand-in was refused (an expired session)' })
  async submit(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Query() query: SoundSessionLocaleQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SubmitSoundSessionResult> {
    const result = await this.commandBus.execute<
      SubmitSoundSessionCommand,
      Result<SubmitSoundSessionResult, SubmitSoundSessionError>
    >(new SubmitSoundSessionCommand(attemptId, user.userId, query.locale ?? 'en'));
    if (result.isOk) return result.value;

    const error = result.error;
    switch (error.code) {
      case 'SESSION_CLOSED':
        throw new ConflictException({ code: error.code, message: 'This session has been handed in or abandoned' });
      case 'SUBMIT_FAILED':
        throw new UnprocessableEntityException({ code: error.code, detail: error.detail, message: 'The session could not be handed in' });
      default:
        throw loadError(error);
    }
  }
}

function loadError(error: LoadSessionError): Error {
  switch (error.code) {
    case 'SESSION_NOT_FOUND':
    case 'NOT_A_SESSION':
      return new NotFoundException({ code: 'SESSION_NOT_FOUND', message: 'No such pronunciation session' });
    case 'SESSION_BROKEN':
      return new InternalServerErrorException({ code: error.code, message: 'The session cannot be read' });
  }
}
