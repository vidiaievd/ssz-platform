import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { ProfileNotFoundException } from '../../domain/exceptions/profile-not-found.exception.js';
import { GetProfileByUserIdQuery } from '../../application/queries/get-profile-by-user-id/get-profile-by-user-id.query.js';
import { GetTeachingProfileByUserIdQuery } from '../../../teaching/application/queries/get-teaching-profile-by-user-id/get-teaching-profile-by-user-id.query.js';
import { TeachingProfileNotFoundException } from '../../../teaching/domain/exceptions/teaching-profile-not-found.exception.js';
import type { ProfileDto } from '../../application/dto/profile.dto.js';
import type { TeachingProfileResponseDto } from '../../../teaching/presentation/dto/teaching-profile.response.dto.js';

export type InternalProfileSummary = {
  userId: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
};

// Service-to-service profile lookups (e.g. organization-service enriching
// member rosters with display names). Not reachable by end users.
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/profiles')
export class InternalProfilesController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get(':userId')
  async getProfileSummary(@Param('userId') userId: string): Promise<InternalProfileSummary> {
    try {
      const profile: ProfileDto = await this.queryBus.execute(new GetProfileByUserIdQuery(userId));
      return {
        userId: profile.userId,
        displayName: profile.displayName,
        firstName: profile.firstName,
        lastName: profile.lastName,
        avatarUrl: profile.avatarUrl,
      };
    } catch (err) {
      if (err instanceof ProfileNotFoundException) throw new NotFoundException();
      throw err;
    }
  }

  @Get(':userId/teaching')
  async getTeachingLanguages(@Param('userId') userId: string): Promise<TeachingProfileResponseDto> {
    try {
      return await this.queryBus.execute(new GetTeachingProfileByUserIdQuery(userId));
    } catch (err) {
      if (err instanceof ProfileNotFoundException || err instanceof TeachingProfileNotFoundException) {
        throw new NotFoundException();
      }
      throw err;
    }
  }
}
