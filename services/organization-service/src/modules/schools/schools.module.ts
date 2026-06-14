import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { SCHOOL_REPOSITORY } from './domain/repositories/school.repository.interface.js';
import { SCHOOL_INVITATION_REPOSITORY } from './domain/repositories/school-invitation.repository.interface.js';
import { SCHOOL_GROUP_REPOSITORY } from './domain/repositories/school-group.repository.interface.js';
import { GROUP_TEACHER_REPOSITORY } from './domain/repositories/group-teacher.repository.interface.js';
import { PROFILE_SERVICE_PORT } from '../../shared/application/ports/profile-service.interface.js';

import { SchoolPrismaRepository } from './infrastructure/persistence/school.prisma.repository.js';
import { SchoolInvitationPrismaRepository } from './infrastructure/persistence/school-invitation.prisma.repository.js';
import { SchoolGroupPrismaRepository } from './infrastructure/persistence/school-group.prisma.repository.js';
import { GroupTeacherPrismaRepository } from './infrastructure/persistence/group-teacher.prisma.repository.js';
import { InvitationTokenService } from './infrastructure/invitation-token.service.js';
import { ProfileServiceHttpClient } from '../../infrastructure/profile/profile-service.http-client.js';
import { SchedulingServiceHttpClient } from '../../infrastructure/scheduling/scheduling-service.http-client.js';

import { CreateSchoolHandler } from './application/commands/create-school/create-school.handler.js';
import { UpdateSchoolHandler } from './application/commands/update-school/update-school.handler.js';
import { DeleteSchoolHandler } from './application/commands/delete-school/delete-school.handler.js';
import { AddMemberHandler } from './application/commands/add-member/add-member.handler.js';
import { RemoveMemberHandler } from './application/commands/remove-member/remove-member.handler.js';
import { SendInvitationHandler } from './application/commands/send-invitation/send-invitation.handler.js';
import { AcceptInvitationHandler } from './application/commands/accept-invitation/accept-invitation.handler.js';
import { ResendSchoolInvitationHandler } from './application/commands/resend-invitation/resend-invitation.handler.js';
import { RevokeSchoolInvitationHandler } from './application/commands/revoke-invitation/revoke-invitation.handler.js';
import { CreateSchoolGroupHandler } from './application/commands/create-school-group/create-school-group.handler.js';
import { UpdateSchoolGroupHandler } from './application/commands/update-school-group/update-school-group.handler.js';
import { DeleteSchoolGroupHandler } from './application/commands/delete-school-group/delete-school-group.handler.js';
import { PublishSchoolGroupHandler } from './application/commands/publish-school-group/publish-school-group.handler.js';
import { ArchiveSchoolGroupHandler } from './application/commands/archive-school-group/archive-school-group.handler.js';
import { AssignGroupTeacherHandler } from './application/commands/assign-group-teacher/assign-group-teacher.handler.js';
import { RemoveGroupTeacherHandler } from './application/commands/remove-group-teacher/remove-group-teacher.handler.js';
import { UpdateTeacherAttrsHandler } from './application/commands/update-teacher-attrs/update-teacher-attrs.handler.js';
import { AddGroupMemberHandler } from './application/commands/add-group-member/add-group-member.handler.js';
import { RemoveGroupMemberHandler } from './application/commands/remove-group-member/remove-group-member.handler.js';
import { UpdateMemberPermissionsHandler } from './application/commands/update-member-permissions/update-member-permissions.handler.js';

import { GetSchoolHandler } from './application/queries/get-school/get-school.handler.js';
import { GetSchoolBySlugHandler } from './application/queries/get-school-by-slug/get-school-by-slug.handler.js';
import { ListMySchoolsHandler } from './application/queries/list-my-schools/list-my-schools.handler.js';
import { CheckNameAvailableHandler } from './application/queries/check-name-available/check-name-available.handler.js';
import { CheckSlugAvailableHandler } from './application/queries/check-slug-available/check-slug-available.handler.js';
import { ListSchoolInvitationsHandler } from './application/queries/list-school-invitations/list-school-invitations.handler.js';
import { GetSchoolGroupHandler } from './application/queries/get-school-group/get-school-group.handler.js';
import { ListSchoolGroupsHandler } from './application/queries/list-school-groups/list-school-groups.handler.js';
import { ListSchoolTeachersHandler } from './application/queries/list-school-teachers/list-school-teachers.handler.js';
import { ListSchoolMembersHandler } from './application/queries/list-school-members/list-school-members.handler.js';
import { CountSchoolInvitationsHandler } from './application/queries/count-school-invitations/count-school-invitations.handler.js';
import { GetSchoolInvitationPreviewHandler } from './application/queries/get-invitation-preview/get-invitation-preview.handler.js';
import { GetMyPermissionsHandler } from './application/queries/get-my-permissions/get-my-permissions.handler.js';

import { SchoolsController } from './presentation/controllers/schools.controller.js';
import { InvitationsController } from './presentation/controllers/invitations.controller.js';
import { InternalController } from './presentation/controllers/internal.controller.js';
import { SchoolGroupsController } from './presentation/controllers/school-groups.controller.js';
import { SchoolTeachersController } from './presentation/controllers/school-teachers.controller.js';
import { SchoolMembersController } from './presentation/controllers/school-members.controller.js';
import { CapabilityResolverService } from './application/services/capability-resolver.service.js';

const CommandHandlers = [
  CreateSchoolHandler,
  UpdateSchoolHandler,
  DeleteSchoolHandler,
  AddMemberHandler,
  RemoveMemberHandler,
  SendInvitationHandler,
  AcceptInvitationHandler,
  ResendSchoolInvitationHandler,
  RevokeSchoolInvitationHandler,
  CreateSchoolGroupHandler,
  UpdateSchoolGroupHandler,
  DeleteSchoolGroupHandler,
  PublishSchoolGroupHandler,
  ArchiveSchoolGroupHandler,
  AssignGroupTeacherHandler,
  RemoveGroupTeacherHandler,
  UpdateTeacherAttrsHandler,
  AddGroupMemberHandler,
  RemoveGroupMemberHandler,
  UpdateMemberPermissionsHandler,
];

const QueryHandlers = [
  GetSchoolHandler,
  GetSchoolBySlugHandler,
  ListMySchoolsHandler,
  CheckNameAvailableHandler,
  CheckSlugAvailableHandler,
  ListSchoolInvitationsHandler,
  GetSchoolGroupHandler,
  ListSchoolGroupsHandler,
  ListSchoolTeachersHandler,
  ListSchoolMembersHandler,
  CountSchoolInvitationsHandler,
  GetSchoolInvitationPreviewHandler,
  GetMyPermissionsHandler,
];

@Module({
  imports: [CqrsModule],
  controllers: [SchoolsController, InvitationsController, InternalController, SchoolGroupsController, SchoolTeachersController, SchoolMembersController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    InvitationTokenService,
    CapabilityResolverService,
    ProfileServiceHttpClient,
    SchedulingServiceHttpClient,
    {
      provide: SCHOOL_REPOSITORY,
      useClass: SchoolPrismaRepository,
    },
    {
      provide: SCHOOL_INVITATION_REPOSITORY,
      useClass: SchoolInvitationPrismaRepository,
    },
    {
      provide: SCHOOL_GROUP_REPOSITORY,
      useClass: SchoolGroupPrismaRepository,
    },
    {
      provide: GROUP_TEACHER_REPOSITORY,
      useClass: GroupTeacherPrismaRepository,
    },
    {
      provide: PROFILE_SERVICE_PORT,
      useClass: ProfileServiceHttpClient,
    },
  ],
})
export class SchoolsModule {}
