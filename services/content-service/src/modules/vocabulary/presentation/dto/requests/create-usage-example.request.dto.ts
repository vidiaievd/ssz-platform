import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateUsageExampleRequestDto {
  @ApiProperty({ example: 'Hei, hvordan har du det?', description: 'The example sentence' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  exampleText: string;

  @ApiPropertyOptional({ example: 'uuid-of-audio-file' })
  @IsOptional()
  @IsUUID()
  audioMediaId?: string;

  @ApiPropertyOptional({ example: 'Standard greeting when meeting friends.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  contextNote?: string;

  @ApiPropertyOptional({
    example: 0,
    description: 'Explicit 0-based position; appended at the end if omitted.',
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
