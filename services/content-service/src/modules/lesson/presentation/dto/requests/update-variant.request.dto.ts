import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateVariantRequestDto {
  @ApiPropertyOptional({ example: 'Greetings — English explanation (Revised)' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  displayTitle?: string;

  @ApiPropertyOptional({
    example: 'Updated description.',
    nullable: true,
    description: 'Pass null to clear the description.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  displayDescription?: string | null;

  @ApiPropertyOptional({ example: '## Hei!\n\nUpdated body...' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  bodyMarkdown?: string;

  @ApiPropertyOptional({
    example: 7,
    minimum: 1,
    maximum: 480,
    nullable: true,
    description: 'Pass null to clear the estimated reading time.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(480)
  estimatedReadingMinutes?: number | null;
}
