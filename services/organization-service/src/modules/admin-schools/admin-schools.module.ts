import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PROFILE_SERVICE_PORT } from '../../shared/application/ports/profile-service.interface.js';
import { ProfileServiceHttpClient } from '../../infrastructure/profile/profile-service.http-client.js';
import { ADMIN_SCHOOLS_READER } from './domain/admin-school.js';
import { GetAdminSchoolHandler } from './application/queries/get-admin-school.handler.js';
import { ListAdminSchoolsHandler } from './application/queries/list-admin-schools.handler.js';
import { AdminSchoolsPrismaReader } from './infrastructure/persistence/admin-schools.prisma.reader.js';
import { AdminSchoolsController } from './presentation/controllers/admin-schools.controller.js';

/** The platform admin panel's read of schools (plan 90). */
@Module({
  imports: [CqrsModule],
  controllers: [AdminSchoolsController],
  providers: [
    ListAdminSchoolsHandler,
    GetAdminSchoolHandler,
    { provide: ADMIN_SCHOOLS_READER, useClass: AdminSchoolsPrismaReader },
    { provide: PROFILE_SERVICE_PORT, useClass: ProfileServiceHttpClient },
  ],
})
export class AdminSchoolsModule {}
