import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttemptResponseDto } from './attempt-response.dto.js';

export class ListMyAttemptsResponseDto {
  @ApiProperty({ type: [AttemptResponseDto], description: 'Attempts ordered newest-first' })
  items!: AttemptResponseDto[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Opaque cursor for the next page (base64). Null when no further pages exist.',
    example: 'eyJzdGFydGVkQXQiOiIyMDI2LTAxLTAxVDEwOjAwOjAwLjAwMFoiLCJpZCI6ImFiYy0xMjMifQ',
  })
  nextCursor!: string | null;

  @ApiProperty({ example: 20, description: 'Page size used for this response' })
  limit!: number;
}
