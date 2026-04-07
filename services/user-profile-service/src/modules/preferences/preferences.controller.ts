import { Controller, Get, Patch, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PreferencesService } from './preferences.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Notification Preferences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('preferences')
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get own notification preferences' })
  @ApiResponse({ status: 200, description: 'Preferences retrieved' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async getPreferences(@CurrentUser('sub') userId: string) {
    return this.preferencesService.getPreferences(userId);
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update notification preferences' })
  @ApiResponse({ status: 200, description: 'Preferences updated' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async updatePreferences(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.preferencesService.updatePreferences(userId, dto);
  }
}
