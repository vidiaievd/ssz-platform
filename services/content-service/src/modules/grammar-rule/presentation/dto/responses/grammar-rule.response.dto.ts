import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GrammarRuleEntity } from '../../../domain/entities/grammar-rule.entity.js';

export class GrammarRuleResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id!: string;

  @ApiPropertyOptional({ example: 'present-tense-norwegian', nullable: true })
  slug!: string | null;

  @ApiProperty({ example: 'no' })
  targetLanguage!: string;

  @ApiProperty({ example: 'A1', enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] })
  difficultyLevel!: string;

  @ApiProperty({ example: 'verbs', enum: ['verbs', 'nouns', 'adjectives', 'tenses'] })
  topic!: string;

  @ApiPropertyOptional({ example: 'present_tense', nullable: true })
  subtopic!: string | null;

  @ApiProperty({ example: 'Present Tense in Norwegian' })
  title!: string;

  @ApiPropertyOptional({ example: 'How to form and use the present tense.', nullable: true })
  description!: string | null;

  @ApiProperty({ example: 'uuid-of-owner-user' })
  ownerUserId!: string;

  @ApiPropertyOptional({ example: 'uuid-of-owner-school', nullable: true })
  ownerSchoolId!: string | null;

  @ApiProperty({ example: 'public', enum: ['public', 'school_private', 'shared', 'private'] })
  visibility!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional()
  deletedAt!: Date | null;

  static from(entity: GrammarRuleEntity): GrammarRuleResponseDto {
    const dto = new GrammarRuleResponseDto();
    dto.id = entity.id;
    dto.slug = entity.slug;
    dto.targetLanguage = entity.targetLanguage;
    dto.difficultyLevel = entity.difficultyLevel;
    dto.topic = entity.topic;
    dto.subtopic = entity.subtopic;
    dto.title = entity.title;
    dto.description = entity.description;
    dto.ownerUserId = entity.ownerUserId;
    dto.ownerSchoolId = entity.ownerSchoolId;
    dto.visibility = entity.visibility;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    dto.deletedAt = entity.deletedAt;
    return dto;
  }
}
