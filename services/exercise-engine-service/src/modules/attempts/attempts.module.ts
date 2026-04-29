import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ATTEMPT_REPOSITORY } from './domain/repositories/attempt.repository.js';
import { PrismaAttemptRepository } from './infrastructure/persistence/prisma-attempt.repository.js';
import { StartAttemptHandler } from './application/commands/start-attempt/start-attempt.handler.js';
import { SubmitAnswerHandler } from './application/commands/submit-answer/submit-answer.handler.js';
import { AbandonAttemptHandler } from './application/commands/abandon-attempt/abandon-attempt.handler.js';
import { GetAttemptByIdHandler } from './application/queries/get-attempt-by-id/get-attempt-by-id.handler.js';
import { ListUserAttemptsHandler } from './application/queries/list-user-attempts/list-user-attempts.handler.js';
import { ListMyAttemptsHandler } from './application/queries/list-my-attempts/list-my-attempts.handler.js';
import { AttemptsController } from './presentation/controllers/attempts.controller.js';
import { MyAttemptsController } from './presentation/controllers/my-attempts.controller.js';

const CommandHandlers = [StartAttemptHandler, SubmitAnswerHandler, AbandonAttemptHandler];
const QueryHandlers = [GetAttemptByIdHandler, ListUserAttemptsHandler, ListMyAttemptsHandler];

@Module({
  imports: [CqrsModule],
  controllers: [AttemptsController, MyAttemptsController],
  providers: [
    PrismaAttemptRepository,
    { provide: ATTEMPT_REPOSITORY, useExisting: PrismaAttemptRepository },
    ...CommandHandlers,
    ...QueryHandlers,
  ],
  exports: [ATTEMPT_REPOSITORY],
})
export class AttemptsModule {}
