import {
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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

  // Temporary endpoint for manual testing before JWT guard is added in Step 10.
  // userId is passed as a query param — will be replaced by @CurrentUser() decorator.
  @Get('me')
  @ApiOperation({ summary: 'Get my profile' })
  @ApiQuery({
    name: 'userId',
    description: 'Temporary: pass userId until JWT guard is added',
  })
  @ApiResponse({ status: 200, type: ProfileResponseDto })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async getMyProfile(
    @Query('userId') userId: string,
  ): Promise<ProfileResponseDto> {
    return this.queryBus.execute(new GetProfileByUserIdQuery(userId));
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update my profile' })
  @ApiQuery({
    name: 'userId',
    description: 'Temporary: pass userId until JWT guard is added',
  })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async updateMyProfile(
    @Query('userId') userId: string,
    @Body() dto: UpdateProfileRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new UpdateProfileCommand(
        userId,
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

  // Temporary test endpoint — creates a profile without auth.
  // Removed in Step 10 when JWT guard is wired.
  @Post('test')
  @ApiOperation({ summary: '[TEST ONLY] Create a profile manually' })
  @ApiResponse({
    status: 201,
    description: 'Profile created, returns profile id',
  })
  @ApiResponse({ status: 409, description: 'Profile already exists' })
  async createTestProfile(
    @Body() dto: CreateProfileRequestDto,
    @Headers('x-user-id') userId: string,
  ): Promise<{ id: string }> {
    const id = await this.commandBus.execute(
      new CreateProfileCommand(
        userId,
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
