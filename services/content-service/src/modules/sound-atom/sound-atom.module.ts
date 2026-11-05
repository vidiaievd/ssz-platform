import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { GetSoundAtomHandler } from './application/queries/get-sound-atom/get-sound-atom.handler.js';
import { SoundAtomController } from './presentation/controllers/sound-atom.controller.js';

// The learner's side of the sound catalogue (plan 86, step 9.2). The catalogue query itself
// lives with the internal routes (step 8.1); this module reads it through the query bus.
@Module({
  imports: [CqrsModule],
  controllers: [SoundAtomController],
  providers: [GetSoundAtomHandler],
})
export class SoundAtomModule {}
