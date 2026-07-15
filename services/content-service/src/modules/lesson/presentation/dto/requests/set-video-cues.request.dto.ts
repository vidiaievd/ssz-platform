import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class VideoCueEntryDto {
  @ApiProperty({ example: 0, minimum: 0, description: '0-based ordinal within the variant' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position: number;

  @ApiProperty({ example: 12.5, minimum: 0, description: 'Cue start time in seconds' })
  @Type(() => Number)
  @Min(0)
  startSeconds: number;

  @ApiProperty({ example: 'Hei, hvordan har du det?' })
  @IsString()
  @IsNotEmpty()
  targetLine: string;

  @ApiPropertyOptional({ example: 'Hi, how are you?' })
  @IsOptional()
  @IsString()
  translationLine?: string;
}

export class SetVideoCuesRequestDto {
  @ApiProperty({ type: [VideoCueEntryDto], description: 'Full replacement set' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VideoCueEntryDto)
  cues: VideoCueEntryDto[];
}
