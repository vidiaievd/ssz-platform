import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '../../infrastructure/database/prisma.module.js';
import { HttpClientsModule } from '../../infrastructure/http/http.module.js';
import { RabbitmqModule } from '../../infrastructure/messaging/rabbitmq.module.js';
import { ASSIGNMENT_REPOSITORY } from './domain/repositories/assignment.repository.interface.js';
import { CLOCK, SystemClock } from '../../shared/application/ports/clock.port.js';
import { PrismaAssignmentRepository } from './infrastructure/persistence/prisma-assignment.repository.js';
import { CreateAssignmentHandler } from './application/commands/create-assignment.handler.js';
import { CancelAssignmentHandler } from './application/commands/cancel-assignment.handler.js';
import { UpdateAssignmentDueDateHandler } from './application/commands/update-assignment-due-date.handler.js';
import { MarkAssignmentCompleteHandler } from './application/commands/mark-assignment-complete.handler.js';
import { GetAssignmentByIdHandler } from './application/queries/get-assignment-by-id.handler.js';
import { ListStudentAssignmentsHandler } from './application/queries/list-student-assignments.handler.js';
import { ListTutorAssignmentsHandler } from './application/queries/list-tutor-assignments.handler.js';
import { ListOverdueAssignmentsHandler } from './application/queries/list-overdue-assignments.handler.js';
import { AssignmentsController } from './presentation/assignments.controller.js';

const CommandHandlers = [
  CreateAssignmentHandler,
  CancelAssignmentHandler,
  UpdateAssignmentDueDateHandler,
  MarkAssignmentCompleteHandler,
];

const QueryHandlers = [
  GetAssignmentByIdHandler,
  ListStudentAssignmentsHandler,
  ListTutorAssignmentsHandler,
  ListOverdueAssignmentsHandler,
];

@Module({
  imports: [CqrsModule, PrismaModule, HttpClientsModule, RabbitmqModule],
  controllers: [AssignmentsController],
  providers: [
    {
      provide: ASSIGNMENT_REPOSITORY,
      useClass: PrismaAssignmentRepository,
    },
    {
      provide: CLOCK,
      useClass: SystemClock,
    },
    ...CommandHandlers,
    ...QueryHandlers,
  ],
  exports: [ASSIGNMENT_REPOSITORY],
})
export class AssignmentsModule {}
