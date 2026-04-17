import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

// Infrastructure — Prisma repositories
import { PrismaExerciseTemplateRepository } from './infrastructure/persistence/prisma-exercise-template.repository.js';

// DI tokens
import { EXERCISE_TEMPLATE_REPOSITORY } from './domain/repositories/exercise-template.repository.interface.js';

// Query handlers
import { GetExerciseTemplatesHandler } from './application/queries/get-exercise-templates/get-exercise-templates.handler.js';
import { GetExerciseTemplateHandler } from './application/queries/get-exercise-template/get-exercise-template.handler.js';

// Controller
import { ExerciseTemplateController } from './presentation/controllers/exercise-template.controller.js';

const QueryHandlers = [GetExerciseTemplatesHandler, GetExerciseTemplateHandler];

@Module({
  imports: [CqrsModule],
  controllers: [ExerciseTemplateController],
  providers: [
    // Repository bindings
    { provide: EXERCISE_TEMPLATE_REPOSITORY, useClass: PrismaExerciseTemplateRepository },

    // CQRS handlers
    ...QueryHandlers,
  ],
  exports: [EXERCISE_TEMPLATE_REPOSITORY],
})
export class ExerciseTemplateModule {}
