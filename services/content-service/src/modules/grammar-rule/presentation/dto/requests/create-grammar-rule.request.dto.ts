import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import { GrammarTopic } from '../../../domain/value-objects/grammar-topic.vo.js';

export class CreateGrammarRuleRequestDto {
  @ApiProperty({ example: 'no' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  targetLanguage!: string;

  @ApiProperty({ example: 'A1', enum: DifficultyLevel })
  @IsEnum(DifficultyLevel)
  difficultyLevel!: DifficultyLevel;

  @ApiProperty({ example: 'verbs', enum: GrammarTopic })
  @IsEnum(GrammarTopic)
  topic!: GrammarTopic;

  @ApiPropertyOptional({ example: 'present_tense' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  subtopic?: string;

  @ApiProperty({ example: 'Present Tense in Norwegian' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional({ example: 'How to form and use the present tense.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: 'public', enum: Visibility })
  @IsEnum(Visibility)
  visibility!: Visibility;

  @ApiPropertyOptional({ example: 'uuid-of-owner-school' })
  @IsOptional()
  @IsUUID()
  ownerSchoolId?: string;
}
