import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_FORMAT_MSG = 'Must be in HH:mm format (e.g. "09:00")';

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  studyRemindersEnabled?: boolean;

  @ApiPropertyOptional({ example: '09:00', description: TIME_FORMAT_MSG })
  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: TIME_FORMAT_MSG })
  reminderTime?: string;

  @ApiPropertyOptional({ example: '22:00', description: `Quiet hours start. ${TIME_FORMAT_MSG}` })
  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: TIME_FORMAT_MSG })
  quietHoursStart?: string;

  @ApiPropertyOptional({ example: '08:00', description: `Quiet hours end. ${TIME_FORMAT_MSG}` })
  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: TIME_FORMAT_MSG })
  quietHoursEnd?: string;
}
