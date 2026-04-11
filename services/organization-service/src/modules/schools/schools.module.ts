import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

// Domain tokens
import { SCHOOL_REPOSITORY } from './domain/repositories/school.repository.interface.js';
import { SCHOOL_INVITATION_REPOSITORY } from './domain/repositories/school-invitation.repository.interface.js';

// Infrastructure
import { SchoolPrismaRepository } from './infrastructure/persistence/school.prisma.repository.js';
import { SchoolInvitationPrismaRepository } from './infrastructure/persistence/school-invitation.prisma.repository.js';

// Commands
import { CreateSchoolHandler } from './application/commands/create-school/create-school.handler.js';
import { UpdateSchoolHandler } from './application/commands/update-school/update-school.handler.js';
import { DeleteSchoolHandler } from './application/commands/delete-school/delete-school.handler.js';
import { AddMemberHandler } from './application/commands/add-member/add-member.handler.js';
import { RemoveMemberHandler } from './application/commands/remove-member/remove-member.handler.js';
import { SendInvitationHandler } from './application/commands/send-invitation/send-invitation.handler.js';
import { AcceptInvitationHandler } from './application/commands/accept-invitation/accept-invitation.handler.js';

// Queries
import { GetSchoolHandler } from './application/queries/get-school/get-school.handler.js';
import { ListMySchoolsHandler } from './application/queries/list-my-schools/list-my-schools.handler.js';

// Presentation
import { SchoolsController } from './presentation/controllers/schools.controller.js';
import { InvitationsController } from './presentation/controllers/invitations.controller.js';

const CommandHandlers = [
  CreateSchoolHandler,
  UpdateSchoolHandler,
  DeleteSchoolHandler,
  AddMemberHandler,
  RemoveMemberHandler,
  SendInvitationHandler,
  AcceptInvitationHandler,
];

const QueryHandlers = [
  GetSchoolHandler,
  ListMySchoolsHandler,
];

@Module({
  imports: [CqrsModule],
  controllers: [SchoolsController, InvitationsController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    {
      provide: SCHOOL_REPOSITORY,
      useClass: SchoolPrismaRepository,
    },
    {
      provide: SCHOOL_INVITATION_REPOSITORY,
      useClass: SchoolInvitationPrismaRepository,
    },
  ],
})
export class SchoolsModule {}
