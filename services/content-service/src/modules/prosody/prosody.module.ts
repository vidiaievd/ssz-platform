import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { PROSODY_LAYER_REPOSITORY } from './domain/repositories/prosody-layer.repository.interface.js';
import { PROSODY_TEXT_READER } from './domain/repositories/prosody-text.reader.interface.js';
import { PrismaProsodyLayerRepository } from './infrastructure/persistence/prisma-prosody-layer.repository.js';
import { PrismaProsodyTextReader } from './infrastructure/persistence/prisma-prosody-text.reader.js';
import { LEXICON_STRESS_SOURCE } from './application/ports/lexicon-stress.source.js';
import { HttpLexiconStressSource } from './infrastructure/http/http-lexicon-stress.source.js';

import { SetProsodyHandler } from './application/commands/set-prosody/set-prosody.handler.js';
import { GetLessonProsodyHandler } from './application/queries/get-lesson-prosody/get-lesson-prosody.handler.js';
import { GetExerciseProsodyHandler } from './application/queries/get-exercise-prosody/get-exercise-prosody.handler.js';
import { GetProsodyAuthoringHandler } from './application/queries/get-prosody-authoring/get-prosody-authoring.handler.js';

import { ProsodyController } from './presentation/controllers/prosody.controller.js';

const CommandHandlers = [SetProsodyHandler];

const QueryHandlers = [
  GetLessonProsodyHandler,
  GetExerciseProsodyHandler,
  GetProsodyAuthoringHandler,
];

// Intonation marks beside lesson bodies and read_aloud passages — plan 86, step 5; the
// lexicon's word stresses under them from ai-service — step 5b.
@Module({
  imports: [CqrsModule],
  controllers: [ProsodyController],
  providers: [
    { provide: PROSODY_LAYER_REPOSITORY, useClass: PrismaProsodyLayerRepository },
    { provide: PROSODY_TEXT_READER, useClass: PrismaProsodyTextReader },
    { provide: LEXICON_STRESS_SOURCE, useClass: HttpLexiconStressSource },
    ...CommandHandlers,
    ...QueryHandlers,
  ],
})
export class ProsodyModule {}
