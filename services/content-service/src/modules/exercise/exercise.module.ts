import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

// Infrastructure — Prisma repositories
import { PrismaExerciseRepository } from './infrastructure/persistence/prisma-exercise.repository.js';
import { PrismaExerciseInstructionRepository } from './infrastructure/persistence/prisma-exercise-instruction.repository.js';

// DI tokens
import { EXERCISE_REPOSITORY } from './domain/repositories/exercise.repository.interface.js';
import { EXERCISE_INSTRUCTION_REPOSITORY } from './domain/repositories/exercise-instruction.repository.interface.js';
import { EXERCISE_TEMPLATE_REPOSITORY } from '../exercise-template/domain/repositories/exercise-template.repository.interface.js';
import { PrismaExerciseTemplateRepository } from '../exercise-template/infrastructure/persistence/prisma-exercise-template.repository.js';

// Command handlers
import { CreateExerciseHandler } from './application/commands/create-exercise/create-exercise.handler.js';
import { UpdateExerciseHandler } from './application/commands/update-exercise/update-exercise.handler.js';
import { DeleteExerciseHandler } from './application/commands/delete-exercise/delete-exercise.handler.js';
import { UpsertExerciseInstructionHandler } from './application/commands/upsert-instruction/upsert-instruction.handler.js';
import { DeleteExerciseInstructionHandler } from './application/commands/delete-instruction/delete-instruction.handler.js';

// Query handlers
import { GetExercisesHandler } from './application/queries/get-exercises/get-exercises.handler.js';
import { GetExerciseHandler } from './application/queries/get-exercise/get-exercise.handler.js';
import { GetExerciseForDisplayHandler } from './application/queries/get-exercise-for-display/get-exercise-for-display.handler.js';
import { GetExerciseWithAnswersHandler } from './application/queries/get-exercise-with-answers/get-exercise-with-answers.handler.js';
import { GetExerciseInstructionsHandler } from './application/queries/get-exercise-instructions/get-exercise-instructions.handler.js';

// Controller
import { ExerciseController } from './presentation/controllers/exercise.controller.js';

const CommandHandlers = [
  CreateExerciseHandler,
  UpdateExerciseHandler,
  DeleteExerciseHandler,
  UpsertExerciseInstructionHandler,
  DeleteExerciseInstructionHandler,
];

const QueryHandlers = [
  GetExercisesHandler,
  GetExerciseHandler,
  GetExerciseForDisplayHandler,
  GetExerciseWithAnswersHandler,
  GetExerciseInstructionsHandler,
];

@Module({
  imports: [CqrsModule],
  controllers: [ExerciseController],
  providers: [
    // Repository bindings
    { provide: EXERCISE_REPOSITORY, useClass: PrismaExerciseRepository },
    { provide: EXERCISE_INSTRUCTION_REPOSITORY, useClass: PrismaExerciseInstructionRepository },
    { provide: EXERCISE_TEMPLATE_REPOSITORY, useClass: PrismaExerciseTemplateRepository },

    // CQRS handlers
    ...CommandHandlers,
    ...QueryHandlers,
  ],
  exports: [EXERCISE_REPOSITORY],
})
export class ExerciseModule {}
