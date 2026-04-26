import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '../../infrastructure/database/prisma.module.js';
import { ENROLLMENT_REPOSITORY } from './domain/repositories/enrollment.repository.interface.js';
import { CLOCK, SystemClock } from '../../shared/application/ports/clock.port.js';
import { PrismaEnrollmentRepository } from './infrastructure/persistence/prisma-enrollment.repository.js';
import { EnrollInContainerHandler } from './application/commands/enroll-in-container.handler.js';
import { UnenrollFromContainerHandler } from './application/commands/unenroll-from-container.handler.js';
import { MarkEnrollmentCompleteHandler } from './application/commands/mark-enrollment-complete.handler.js';
import { GetEnrollmentHandler } from './application/queries/get-enrollment.handler.js';
import { ListUserEnrollmentsHandler } from './application/queries/list-user-enrollments.handler.js';
import { EnrollmentsController } from './presentation/enrollments.controller.js';

const CommandHandlers = [
  EnrollInContainerHandler,
  UnenrollFromContainerHandler,
  MarkEnrollmentCompleteHandler,
];

const QueryHandlers = [
  GetEnrollmentHandler,
  ListUserEnrollmentsHandler,
];

@Module({
  imports: [CqrsModule, PrismaModule],
  controllers: [EnrollmentsController],
  providers: [
    {
      provide: ENROLLMENT_REPOSITORY,
      useClass: PrismaEnrollmentRepository,
    },
    {
      provide: CLOCK,
      useClass: SystemClock,
    },
    ...CommandHandlers,
    ...QueryHandlers,
  ],
  exports: [ENROLLMENT_REPOSITORY],
})
export class EnrollmentsModule {}
