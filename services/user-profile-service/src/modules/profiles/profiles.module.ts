import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CreateProfileHandler } from './application/commands/create-profile/create-profile.handler.js';
import { UpdateProfileHandler } from './application/commands/update-profile/update-profile.handler.js';
import { GetProfileByUserIdHandler } from './application/queries/get-profile-by-user-id/get-profile-by-user-id.handler.js';
import { PROFILE_REPOSITORY } from './domain/repositories/profile.repository.interface.js';
import { ProfilePrismaRepository } from './infrastructure/persistence/profile.prisma.repository.js';
import { ProfilesController } from './presentation/controllers/profiles.controller.js';

const CommandHandlers = [CreateProfileHandler, UpdateProfileHandler];
const QueryHandlers = [GetProfileByUserIdHandler];

@Module({
  imports: [CqrsModule],
  controllers: [ProfilesController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    // Bind the IProfileRepository interface token to the Prisma implementation.
    // PrismaService is available globally via PrismaModule (@Global).
    {
      provide: PROFILE_REPOSITORY,
      useClass: ProfilePrismaRepository,
    },
  ],
})
export class ProfilesModule {}
