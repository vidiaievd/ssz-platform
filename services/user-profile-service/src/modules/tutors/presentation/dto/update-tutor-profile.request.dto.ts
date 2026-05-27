import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateTutorProfileRequestDto {
  @ApiPropertyOptional({
    description: "Hourly rate in the tutor's preferred currency",
    example: 450,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @ApiPropertyOptional({
    description: 'Years of teaching experience',
    example: 5,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  yearsOfExperience?: number;
}
