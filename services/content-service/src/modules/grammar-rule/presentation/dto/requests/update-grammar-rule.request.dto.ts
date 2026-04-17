import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import { GrammarTopic } from '../../../domain/value-objects/grammar-topic.vo.js';

export class UpdateGrammarRuleRequestDto {
  @ApiPropertyOptional({ example: 'Present Tense in Norwegian — Updated' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ example: 'Updated description.', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ example: 'A2', enum: DifficultyLevel })
  @IsOptional()
  @IsEnum(DifficultyLevel)
  difficultyLevel?: DifficultyLevel;

  @ApiPropertyOptional({ example: 'tenses', enum: GrammarTopic })
  @IsOptional()
  @IsEnum(GrammarTopic)
  topic?: GrammarTopic;

  @ApiPropertyOptional({ example: 'past_tense', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  subtopic?: string | null;

  @ApiPropertyOptional({ example: 'public', enum: Visibility })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;
}
