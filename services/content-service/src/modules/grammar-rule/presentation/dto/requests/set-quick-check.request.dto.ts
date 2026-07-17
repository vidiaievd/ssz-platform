import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

// Upsert-or-clear pair, same REST shape as set-video-cues-style bulk-set endpoints
// but scoped to a single 0..1 row. PUT upserts (body below); DELETE clears the row —
// a nullable request body was avoided since class-validator decorators can't express
// "whole body is null" cleanly, so the clear path uses a distinct DELETE endpoint instead.
export class SetQuickCheckRequestDto {
  @ApiProperty({ example: 'Which sentence uses the present tense correctly?' })
  @IsString()
  @IsNotEmpty()
  question: string;

  @ApiProperty({ example: ['Jeg spiser epler.', 'Jeg spise epler.'], type: [String] })
  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  options: string[];

  @ApiProperty({ example: 0, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  correctOptionIndex: number;

  @ApiProperty({ example: 'The verb "spise" takes an -r ending in the present tense.' })
  @IsString()
  @IsNotEmpty()
  explanation: string;
}
