import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CqrsModule } from '@nestjs/cqrs';
import { AttemptsModule } from '../attempts/attempts.module.js';
import { ProbesModule } from '../probes/probes.module.js';
import {
  LEARNER_SOUNDS_READER,
  RECORDING_DISCARDER,
  SOUND_DRILL_READER,
  SOUND_TAKE_JUDGE,
} from './application/ports/sound-session.ports.js';
import {
  HttpLearnerSoundsReader,
  HttpRecordingDiscarder,
  HttpSoundDrillReader,
  HttpSoundTakeJudge,
} from './infrastructure/http/http-sound-session-sources.js';
import { StartSoundSessionHandler } from './application/commands/start-sound-session/start-sound-session.handler.js';
import { RecordSoundTakeHandler } from './application/commands/record-sound-take/record-sound-take.handler.js';
import { SubmitSoundSessionHandler } from './application/commands/submit-sound-session/submit-sound-session.handler.js';
import { GetSoundSessionItemsHandler } from './application/queries/get-sound-session-items/get-sound-session-items.handler.js';
import { SoundSessionLoader } from './application/session-loader.js';
import { SoundSessionsController } from './presentation/controllers/sound-sessions.controller.js';

/**
 * The pronunciation session — the «speech therapist» of plan 86, step 13.4: its sources (13.4b),
 * its start (13.4c) and the driver of its takes — items, takes, hand-in (13.4d).
 */
@Module({
  imports: [HttpModule, CqrsModule, AttemptsModule, ProbesModule],
  controllers: [SoundSessionsController],
  providers: [
    HttpLearnerSoundsReader,
    { provide: LEARNER_SOUNDS_READER, useExisting: HttpLearnerSoundsReader },
    HttpSoundDrillReader,
    { provide: SOUND_DRILL_READER, useExisting: HttpSoundDrillReader },
    HttpSoundTakeJudge,
    { provide: SOUND_TAKE_JUDGE, useExisting: HttpSoundTakeJudge },
    HttpRecordingDiscarder,
    { provide: RECORDING_DISCARDER, useExisting: HttpRecordingDiscarder },
    SoundSessionLoader,
    StartSoundSessionHandler,
    RecordSoundTakeHandler,
    SubmitSoundSessionHandler,
    GetSoundSessionItemsHandler,
  ],
  exports: [LEARNER_SOUNDS_READER, SOUND_DRILL_READER, SOUND_TAKE_JUDGE],
})
export class SoundSessionsModule {}
