import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ATTEMPT_REPOSITORY } from './domain/repositories/attempt.repository.js';
import { PrismaAttemptRepository } from './infrastructure/persistence/prisma-attempt.repository.js';
import { StartAttemptHandler } from './application/commands/start-attempt/start-attempt.handler.js';
import { SubmitAnswerHandler } from './application/commands/submit-answer/submit-answer.handler.js';
import { AbandonAttemptHandler } from './application/commands/abandon-attempt/abandon-attempt.handler.js';
import { AttemptsController } from './presentation/controllers/attempts.controller.js';

const CommandHandlers = [StartAttemptHandler, SubmitAnswerHandler, AbandonAttemptHandler];

@Module({
  imports: [CqrsModule],
  controllers: [AttemptsController],
  providers: [
    PrismaAttemptRepository,
    { provide: ATTEMPT_REPOSITORY, useExisting: PrismaAttemptRepository },
    ...CommandHandlers,
  ],
  exports: [ATTEMPT_REPOSITORY],
})
export class AttemptsModule {}
