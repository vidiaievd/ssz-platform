import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PROFILE_SERVICE_PORT } from '../../shared/application/ports/profile-service.interface.js';
import { ProfileServiceHttpClient } from '../../infrastructure/profile/profile-service.http-client.js';
import { ADMIN_SCHOOLS_READER } from './domain/admin-school.js';
import { ADMIN_STATS_READER } from './domain/admin-stats.js';
import { ADMIN_SCHOOL_ROSTER_READER } from './domain/admin-school-roster.js';
import { GetAdminSchoolSettingsHandler } from './application/queries/get-admin-school-settings.handler.js';
import { ListAdminSchoolMembersHandler } from './application/queries/list-admin-school-members.handler.js';
import { AdminSchoolRosterPrismaReader } from './infrastructure/persistence/admin-school-roster.prisma.reader.js';
import { GetAdminStatsHandler } from './application/queries/get-admin-stats.handler.js';
import { GetAdminSchoolHandler } from './application/queries/get-admin-school.handler.js';
import { ListAdminSchoolsHandler } from './application/queries/list-admin-schools.handler.js';
import { AdminStatsPrismaReader } from './infrastructure/persistence/admin-stats.prisma.reader.js';
import { AdminSchoolsPrismaReader } from './infrastructure/persistence/admin-schools.prisma.reader.js';
import { AdminSchoolsController } from './presentation/controllers/admin-schools.controller.js';
import { AdminStatsController } from './presentation/controllers/admin-stats.controller.js';

/** The platform admin panel's read of schools and their numbers (plan 90). */
@Module({
  imports: [CqrsModule],
  controllers: [AdminSchoolsController, AdminStatsController],
  providers: [
    ListAdminSchoolsHandler,
    GetAdminSchoolHandler,
    GetAdminStatsHandler,
    ListAdminSchoolMembersHandler,
    GetAdminSchoolSettingsHandler,
    { provide: ADMIN_SCHOOLS_READER, useClass: AdminSchoolsPrismaReader },
    { provide: ADMIN_STATS_READER, useClass: AdminStatsPrismaReader },
    { provide: ADMIN_SCHOOL_ROSTER_READER, useClass: AdminSchoolRosterPrismaReader },
    { provide: PROFILE_SERVICE_PORT, useClass: ProfileServiceHttpClient },
  ],
})
export class AdminSchoolsModule {}
