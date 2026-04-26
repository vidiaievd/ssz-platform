import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class UpdateDueDateRequest {
  @ApiProperty({ description: 'New due date (ISO 8601, must be in the future)', example: '2026-08-01T12:00:00Z' })
  @IsDateString()
  dueAt!: string;
}
