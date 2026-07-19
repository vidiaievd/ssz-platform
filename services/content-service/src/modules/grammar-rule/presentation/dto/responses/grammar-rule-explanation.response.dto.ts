import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GrammarRuleExplanationEntity } from '../../../domain/entities/grammar-rule-explanation.entity.js';
import { GrammarRuleCompareExampleEntity } from '../../../domain/entities/grammar-rule-compare-example.entity.js';
import { GrammarRuleQuickCheckEntity } from '../../../domain/entities/grammar-rule-quick-check.entity.js';

export class GrammarRuleCompareExampleResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id!: string;

  @ApiProperty({ example: 'uuid-of-explanation' })
  explanationId!: string;

  @ApiProperty({ example: 0 })
  position!: number;

  @ApiProperty({ example: 'Jeg spiser epler.' })
  sentence!: string;

  @ApiPropertyOptional({ example: 'Present tense, correct word order.', nullable: true })
  note!: string | null;

  @ApiProperty({ example: true })
  isCorrect!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static from(entity: GrammarRuleCompareExampleEntity): GrammarRuleCompareExampleResponseDto {
    const dto = new GrammarRuleCompareExampleResponseDto();
    dto.id = entity.id;
    dto.explanationId = entity.explanationId;
    dto.position = entity.position;
    dto.sentence = entity.sentence;
    dto.note = entity.note;
    dto.isCorrect = entity.isCorrect;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}

export class GrammarRuleQuickCheckResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id!: string;

  @ApiProperty({ example: 'uuid-of-explanation' })
  explanationId!: string;

  @ApiProperty({ example: 'Which sentence uses the present tense correctly?' })
  question!: string;

  @ApiProperty({ example: ['Jeg spiser epler.', 'Jeg spise epler.'], type: [String] })
  options!: string[];

  @ApiProperty({ example: 0 })
  correctOptionIndex!: number;

  @ApiProperty({ example: 'The verb "spise" takes an -r ending in the present tense.' })
  explanation!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static from(entity: GrammarRuleQuickCheckEntity): GrammarRuleQuickCheckResponseDto {
    const dto = new GrammarRuleQuickCheckResponseDto();
    dto.id = entity.id;
    dto.explanationId = entity.explanationId;
    dto.question = entity.question;
    dto.options = entity.options;
    dto.correctOptionIndex = entity.correctOptionIndex;
    dto.explanation = entity.explanation;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}

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

  @ApiPropertyOptional({ example: 'Jeg spiser epler hver dag.', nullable: true })
  anchorText!: string | null;

  @ApiProperty({ example: ['spiser'], type: [String] })
  anchorHighlights!: string[];

  @ApiPropertyOptional({ example: 'Notice the -er ending.', nullable: true })
  anchorNote!: string | null;

  @ApiProperty({ type: [GrammarRuleCompareExampleResponseDto] })
  compareExamples!: GrammarRuleCompareExampleResponseDto[];

  @ApiPropertyOptional({ type: GrammarRuleQuickCheckResponseDto, nullable: true })
  quickCheck!: GrammarRuleQuickCheckResponseDto | null;

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

  static from(
    entity: GrammarRuleExplanationEntity,
    compareExamples: GrammarRuleCompareExampleEntity[] = [],
    quickCheck: GrammarRuleQuickCheckEntity | null = null,
  ): GrammarRuleExplanationResponseDto {
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
    dto.anchorText = entity.anchorText;
    dto.anchorHighlights = entity.anchorHighlights;
    dto.anchorNote = entity.anchorNote;
    dto.compareExamples = compareExamples
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((e) => GrammarRuleCompareExampleResponseDto.from(e));
    dto.quickCheck = quickCheck ? GrammarRuleQuickCheckResponseDto.from(quickCheck) : null;
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
