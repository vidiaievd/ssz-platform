import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateTutorProfileRequestDto {
  @ApiProperty({
    description: 'Hourly rate in USD',
    example: 25.0,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @ApiProperty({
    description: 'Years of teaching experience',
    example: 3,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  yearsOfExperience?: number;
}
