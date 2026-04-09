import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { Public } from '../../../../common/decorators/public.decorator.js';
import type { JwtPayload } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { CreateProfileCommand } from '../../application/commands/create-profile/create-profile.command.js';
import { UpdateProfileCommand } from '../../application/commands/update-profile/update-profile.command.js';
import { GetProfileByUserIdQuery } from '../../application/queries/get-profile-by-user-id/get-profile-by-user-id.query.js';
import { CreateProfileRequestDto } from '../dto/create-profile.request.dto.js';
import { ProfileResponseDto } from '../dto/profile.response.dto.js';
import { UpdateProfileRequestDto } from '../dto/update-profile.request.dto.js';

@ApiTags('profiles')
@ApiBearerAuth('JWT')
@Controller('profiles')
export class ProfilesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my profile' })
  @ApiResponse({ status: 200, type: ProfileResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async getMyProfile(
    @CurrentUser() user: JwtPayload,
  ): Promise<ProfileResponseDto> {
    return this.queryBus.execute(new GetProfileByUserIdQuery(user.sub));
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update my profile' })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async updateMyProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new UpdateProfileCommand(
        user.sub,
        dto.displayName,
        dto.firstName,
        dto.lastName,
        dto.avatarUrl,
        dto.bio,
        dto.timezone,
        dto.locale,
      ),
    );
  }

  // Temporary test endpoint — public so it can be called without a real JWT.
  // Used to seed profiles during development. Remove before production.
  @Public()
  @Post('test')
  @ApiOperation({ summary: '[TEST ONLY] Create a profile without auth' })
  @ApiResponse({
    status: 201,
    description: 'Profile created, returns profile id',
  })
  @ApiResponse({ status: 409, description: 'Profile already exists' })
  async createTestProfile(
    @Body() dto: CreateProfileRequestDto,
  ): Promise<{ id: string }> {
    // userId comes from the DTO for testing purposes only
    const id = await this.commandBus.execute(
      new CreateProfileCommand(
        dto.userId,
        dto.displayName,
        dto.profileType,
        dto.firstName,
        dto.lastName,
        dto.timezone,
        dto.locale,
      ),
    );
    return { id };
  }
}
