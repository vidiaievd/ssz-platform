import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SortQueryDto {
  @ApiPropertyOptional({
    example: 'created_at_desc',
    description:
      'Sort order. Comma-separated list of up to 3 tokens in the form field_direction ' +
      '(e.g. "created_at_desc,title_asc"). Allowed fields vary per endpoint.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sort?: string;
}
