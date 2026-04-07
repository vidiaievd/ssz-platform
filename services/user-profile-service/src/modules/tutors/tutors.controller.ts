import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TutorsService } from './tutors.service';
import { UpsertTutorProfileDto } from './dto/upsert-tutor-profile.dto';
import { AddTutorLanguageDto } from './dto/add-tutor-language.dto';
import { AddQualificationDto } from './dto/add-qualification.dto';
import { TutorsFilterDto } from './dto/tutors-filter.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Tutor Profiles')
@Controller()
export class TutorsController {
  constructor(private readonly tutorsService: TutorsService) {}

  // ─── Authenticated tutor endpoints ───────────────────────────────────────────

  @Post('profiles/me/tutor')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create or update tutor profile' })
  @ApiResponse({ status: 200, description: 'Tutor profile upserted' })
  @ApiResponse({ status: 400, description: 'Not a tutor profile' })
  async upsertTutorProfile(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpsertTutorProfileDto,
  ) {
    return this.tutorsService.upsertTutorProfile(userId, dto);
  }

  @Get('profiles/me/tutor')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get own tutor profile' })
  async getTutorProfile(@CurrentUser('sub') userId: string) {
    return this.tutorsService.getTutorProfile(userId);
  }

  @Post('profiles/me/tutor/languages')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a teaching language' })
  @ApiResponse({ status: 201, description: 'Language added' })
  @ApiResponse({ status: 409, description: 'Language already in list' })
  async addLanguage(
    @CurrentUser('sub') userId: string,
    @Body() dto: AddTutorLanguageDto,
  ) {
    return this.tutorsService.addLanguage(userId, dto);
  }

  @Post('profiles/me/tutor/qualifications')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a qualification/certificate' })
  @ApiResponse({ status: 201, description: 'Qualification added' })
  async addQualification(
    @CurrentUser('sub') userId: string,
    @Body() dto: AddQualificationDto,
  ) {
    return this.tutorsService.addQualification(userId, dto);
  }

  // ─── Public tutor search ──────────────────────────────────────────────────────

  @Get('tutors')
  @ApiOperation({ summary: 'Search tutors with filters' })
  @ApiResponse({ status: 200, description: 'Paginated list of tutors' })
  async searchTutors(@Query() filter: TutorsFilterDto) {
    return this.tutorsService.searchTutors(filter);
  }
}
