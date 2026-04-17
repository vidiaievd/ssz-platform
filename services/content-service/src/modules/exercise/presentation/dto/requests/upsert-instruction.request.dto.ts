import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertExerciseInstructionRequestDto {
  @ApiProperty({ example: 'en' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  instructionLanguage!: string;

  @ApiProperty({ example: 'Choose the correct translation for the highlighted word.' })
  @IsString()
  @IsNotEmpty()
  instructionText!: string;

  @ApiPropertyOptional({ example: 'Look at the context of the sentence.', nullable: true })
  @IsOptional()
  @IsString()
  hintText?: string | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'JSONB map of $$placeholder$$ tokens to per-language override strings.',
  })
  @IsOptional()
  @IsObject()
  textOverrides?: Record<string, unknown> | null;
}
