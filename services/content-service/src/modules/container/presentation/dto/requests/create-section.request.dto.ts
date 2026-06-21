import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';

export class CreateSectionRequestDto {
  @ApiProperty({ example: 'A1 — Beginner' })
  @IsString()
  @MaxLength(100)
  title: string;

  @ApiPropertyOptional({
    example: 0,
    description: 'Position to insert at; defaults to appending after the last section',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
