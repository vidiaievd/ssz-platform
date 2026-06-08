import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export type WeekDayEnum = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
const WEEKDAYS: WeekDayEnum[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class SlotInputDto {
  @ApiProperty({ enum: WEEKDAYS, example: 'mon' })
  @IsEnum(WEEKDAYS)
  weekday!: WeekDayEnum;

  @ApiProperty({ example: '09:00' })
  @IsString()
  @Matches(TIME_PATTERN, { message: 'startTime must be HH:MM' })
  startTime!: string;

  @ApiProperty({ example: '10:30' })
  @IsString()
  @Matches(TIME_PATTERN, { message: 'endTime must be HH:MM' })
  endTime!: string;

  @ApiPropertyOptional({ example: 'Room 101' })
  @IsOptional()
  @IsString()
  room?: string | null;
}

export class ReplaceSlotsBodyDto {
  @ApiProperty({ type: [SlotInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SlotInputDto)
  slots!: SlotInputDto[];
}

export class SlotResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() groupId!: string;
  @ApiProperty() schoolId!: string;
  @ApiProperty({ enum: WEEKDAYS }) weekday!: WeekDayEnum;
  @ApiProperty() startTime!: string;
  @ApiProperty() endTime!: string;
  @ApiPropertyOptional() room!: string | null;
  @ApiProperty() createdAt!: string;
}
