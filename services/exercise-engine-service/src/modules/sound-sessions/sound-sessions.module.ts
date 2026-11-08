import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CqrsModule } from '@nestjs/cqrs';
import { AttemptsModule } from '../attempts/attempts.module.js';
import { ProbesModule } from '../probes/probes.module.js';
import {
  LEARNER_SOUNDS_READER,
  SOUND_DRILL_READER,
  SOUND_TAKE_JUDGE,
} from './application/ports/sound-session.ports.js';
import {
  HttpLearnerSoundsReader,
  HttpSoundDrillReader,
  HttpSoundTakeJudge,
} from './infrastructure/http/http-sound-session-sources.js';
import { StartSoundSessionHandler } from './application/commands/start-sound-session/start-sound-session.handler.js';
import { SoundSessionsController } from './presentation/controllers/sound-sessions.controller.js';

/**
 * The pronunciation session — the «speech therapist» of plan 86, step 13.4: its sources (13.4b) and
 * its start (13.4c); the driver of its takes comes in 13.4d.
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
    StartSoundSessionHandler,
  ],
  exports: [LEARNER_SOUNDS_READER, SOUND_DRILL_READER, SOUND_TAKE_JUDGE],
})
export class SoundSessionsModule {}
