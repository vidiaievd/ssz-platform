import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class ReadAllDto {
  @ApiPropertyOptional({
    description:
      'Mark only notifications created at or before this instant — the newest one the reader had on screen, ' +
      'so what arrived after stays unread (VoxOrd plan 06, step 6d). Omitted: everything unread.',
    example: '2026-10-29T17:30:00.000Z',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  before?: string;
}
