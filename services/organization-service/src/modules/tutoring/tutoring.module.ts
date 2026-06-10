import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { TUTORING_GROUP_REPOSITORY } from './domain/repositories/tutoring-group.repository.interface.js';
import { TUTORING_INVITATION_REPOSITORY } from './domain/repositories/tutoring-invitation.repository.interface.js';

import { TutoringGroupPrismaRepository } from './infrastructure/persistence/tutoring-group.prisma.repository.js';
import { TutoringInvitationPrismaRepository } from './infrastructure/persistence/tutoring-invitation.prisma.repository.js';
import { TutoringInvitationTokenService } from './infrastructure/tutoring-invitation-token.service.js';

import { CreateTutoringGroupHandler } from './application/commands/create-tutoring-group/create-tutoring-group.handler.js';
import { UpdateTutoringGroupHandler } from './application/commands/update-tutoring-group/update-tutoring-group.handler.js';
import { DeleteTutoringGroupHandler } from './application/commands/delete-tutoring-group/delete-tutoring-group.handler.js';
import { RemoveStudentHandler } from './application/commands/remove-student/remove-student.handler.js';
import { SendTutoringInvitationHandler } from './application/commands/send-invitation/send-invitation.handler.js';
import { AcceptTutoringInvitationHandler } from './application/commands/accept-invitation/accept-invitation.handler.js';
import { ResendTutoringInvitationHandler } from './application/commands/resend-invitation/resend-tutoring-invitation.handler.js';
import { RevokeTutoringInvitationHandler } from './application/commands/revoke-invitation/revoke-tutoring-invitation.handler.js';

import { GetMyGroupHandler } from './application/queries/get-my-group/get-my-group.handler.js';
import { GetMyTutorHandler } from './application/queries/get-my-tutor/get-my-tutor.handler.js';
import { ListPendingInvitationsHandler } from './application/queries/list-pending-invitations/list-pending-invitations.handler.js';

import { TutoringController } from './presentation/controllers/tutoring.controller.js';
import { TutoringInvitationsController } from './presentation/controllers/tutoring-invitations.controller.js';

const CommandHandlers = [
  CreateTutoringGroupHandler,
  UpdateTutoringGroupHandler,
  DeleteTutoringGroupHandler,
  RemoveStudentHandler,
  SendTutoringInvitationHandler,
  AcceptTutoringInvitationHandler,
  ResendTutoringInvitationHandler,
  RevokeTutoringInvitationHandler,
];

const QueryHandlers = [
  GetMyGroupHandler,
  GetMyTutorHandler,
  ListPendingInvitationsHandler,
];

@Module({
  imports: [CqrsModule],
  controllers: [TutoringController, TutoringInvitationsController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    TutoringInvitationTokenService,
    {
      provide: TUTORING_GROUP_REPOSITORY,
      useClass: TutoringGroupPrismaRepository,
    },
    {
      provide: TUTORING_INVITATION_REPOSITORY,
      useClass: TutoringInvitationPrismaRepository,
    },
  ],
})
export class TutoringModule {}
