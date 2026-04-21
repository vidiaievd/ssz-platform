import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GrammarRuleExplanationEntity } from '../../../domain/entities/grammar-rule-explanation.entity.js';

export class GrammarRuleExplanationResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id!: string;

  @ApiProperty({ example: 'uuid-of-grammar-rule' })
  grammarRuleId!: string;

  @ApiProperty({ example: 'en' })
  explanationLanguage!: string;

  @ApiProperty({ example: 'A1', enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] })
  minLevel!: string;

  @ApiProperty({ example: 'A2', enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] })
  maxLevel!: string;

  @ApiProperty({ example: 'Present Tense — English (A1–A2)' })
  displayTitle!: string;

  @ApiPropertyOptional({
    example: 'Beginner guide to the Norwegian present tense.',
    nullable: true,
  })
  displaySummary!: string | null;

  @ApiProperty({ example: '## The Present Tense\n\nIn Norwegian...' })
  bodyMarkdown!: string;

  @ApiPropertyOptional({ example: 8, nullable: true })
  estimatedReadingMinutes!: number | null;

  @ApiProperty({ example: 'draft', enum: ['draft', 'published'] })
  status!: string;

  @ApiProperty({ example: 'uuid-of-creator' })
  createdByUserId!: string;

  @ApiProperty({ example: 'uuid-of-last-editor' })
  lastEditedByUserId!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional()
  publishedAt!: Date | null;

  @ApiPropertyOptional()
  deletedAt!: Date | null;

  static from(entity: GrammarRuleExplanationEntity): GrammarRuleExplanationResponseDto {
    const dto = new GrammarRuleExplanationResponseDto();
    dto.id = entity.id;
    dto.grammarRuleId = entity.grammarRuleId;
    dto.explanationLanguage = entity.explanationLanguage;
    dto.minLevel = entity.minLevel;
    dto.maxLevel = entity.maxLevel;
    dto.displayTitle = entity.displayTitle;
    dto.displaySummary = entity.displaySummary;
    dto.bodyMarkdown = entity.bodyMarkdown;
    dto.estimatedReadingMinutes = entity.estimatedReadingMinutes;
    dto.status = entity.status;
    dto.createdByUserId = entity.createdByUserId;
    dto.lastEditedByUserId = entity.lastEditedByUserId;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    dto.publishedAt = entity.publishedAt;
    dto.deletedAt = entity.deletedAt;
    return dto;
  }
}
