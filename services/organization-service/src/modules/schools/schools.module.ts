import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { SCHOOL_REPOSITORY } from './domain/repositories/school.repository.interface.js';
import { SCHOOL_INVITATION_REPOSITORY } from './domain/repositories/school-invitation.repository.interface.js';

import { SchoolPrismaRepository } from './infrastructure/persistence/school.prisma.repository.js';
import { SchoolInvitationPrismaRepository } from './infrastructure/persistence/school-invitation.prisma.repository.js';
import { InvitationTokenService } from './infrastructure/invitation-token.service.js';

import { CreateSchoolHandler } from './application/commands/create-school/create-school.handler.js';
import { UpdateSchoolHandler } from './application/commands/update-school/update-school.handler.js';
import { DeleteSchoolHandler } from './application/commands/delete-school/delete-school.handler.js';
import { AddMemberHandler } from './application/commands/add-member/add-member.handler.js';
import { RemoveMemberHandler } from './application/commands/remove-member/remove-member.handler.js';
import { SendInvitationHandler } from './application/commands/send-invitation/send-invitation.handler.js';
import { AcceptInvitationHandler } from './application/commands/accept-invitation/accept-invitation.handler.js';

import { GetSchoolHandler } from './application/queries/get-school/get-school.handler.js';
import { GetSchoolBySlugHandler } from './application/queries/get-school-by-slug/get-school-by-slug.handler.js';
import { ListMySchoolsHandler } from './application/queries/list-my-schools/list-my-schools.handler.js';
import { CheckNameAvailableHandler } from './application/queries/check-name-available/check-name-available.handler.js';
import { CheckSlugAvailableHandler } from './application/queries/check-slug-available/check-slug-available.handler.js';
import { ListSchoolInvitationsHandler } from './application/queries/list-school-invitations/list-school-invitations.handler.js';

import { SchoolsController } from './presentation/controllers/schools.controller.js';
import { InvitationsController } from './presentation/controllers/invitations.controller.js';
import { InternalController } from './presentation/controllers/internal.controller.js';

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
  GetSchoolBySlugHandler,
  ListMySchoolsHandler,
  CheckNameAvailableHandler,
  CheckSlugAvailableHandler,
  ListSchoolInvitationsHandler,
];

@Module({
  imports: [CqrsModule],
  controllers: [SchoolsController, InvitationsController, InternalController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    InvitationTokenService,
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
