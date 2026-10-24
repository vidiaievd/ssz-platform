import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DiagnosticPayerDto, DiagnosticResponseDto } from '../../diagnostic/presentation/diagnostic.dto.js';
import { REVIEW_ASPECTS } from '../domain/review-aspect.js';

export class TranslateLangsDto {
  @ApiProperty({ example: 'Russisk', description: "The template's explanation language label" })
  @IsString()
  @MaxLength(60)
  explain!: string;

  @ApiProperty({ example: 'Norsk', description: 'The language being learnt' })
  @IsString()
  @MaxLength(60)
  target!: string;
}

export class ReviewChecksDto {
  @ApiPropertyOptional({ example: true }) @IsOptional() @IsBoolean() grammar?: boolean;
  @ApiPropertyOptional({ example: true }) @IsOptional() @IsBoolean() order?: boolean;
  @ApiPropertyOptional({ example: true }) @IsOptional() @IsBoolean() lexis?: boolean;
  @ApiPropertyOptional({ example: false }) @IsOptional() @IsBoolean() register?: boolean;
}

export class TranslateSentenceDto {
  @ApiPropertyOptional({ example: 'i1', description: 'Item id; defaults to its position, `s1`, `s2`, …' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  itemId?: string;

  @ApiProperty({ enum: ['to_target', 'from_target'], example: 'to_target' })
  @IsIn(['to_target', 'from_target'])
  direction!: 'to_target' | 'from_target';

  @ApiProperty({ example: 'Я живу в Осло уже два года.' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  source!: string;

  @ApiProperty({ type: [String], example: ['Jeg har bodd i Oslo i to år (nå|)'] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  refs!: string[];

  @ApiProperty({ example: 'Jeg bor i Oslo i to år.' })
  @IsString()
  @MaxLength(2000)
  answer!: string;

  @ApiPropertyOptional({ example: 'Perfektum: the state started in the past and still holds.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  explanation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  teacherNote?: string;
}

export class TryTranslateReviewDto {
  @ApiProperty({ type: TranslateLangsDto })
  @ValidateNested()
  @Type(() => TranslateLangsDto)
  langs!: TranslateLangsDto;

  @ApiProperty({ example: 'Russian', description: "The language the remarks are written in — the school's explanation language" })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  commentLanguage!: string;

  @ApiProperty({ type: ReviewChecksDto, description: 'The exercise\'s `ai.checks`; at least one must be on' })
  @ValidateNested()
  @Type(() => ReviewChecksDto)
  checks!: ReviewChecksDto;

  @ApiProperty({ type: [TranslateSentenceDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => TranslateSentenceDto)
  sentences!: TranslateSentenceDto[];

  @ApiPropertyOptional({
    type: DiagnosticPayerDto,
    description: "Run as this payer: its policy and tariff apply and the ledger row is its. Omitted = the platform pays",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DiagnosticPayerDto)
  asPayer?: DiagnosticPayerDto;
}

export class ReviewRemarkDto {
  @ApiProperty({ example: 's1' }) itemId!: string;
  @ApiProperty({ example: 1 }) sentenceIndex!: number;
  @ApiProperty({ enum: REVIEW_ASPECTS, example: 'grammar' }) aspect!: string;
  @ApiProperty({ example: 'bor', description: "Verbatim from the learner's answer" }) fragment!: string;
  @ApiProperty({ example: 'Действие началось в прошлом и продолжается — нужен perfektum.' }) comment!: string;
  @ApiProperty({ type: String, nullable: true, example: 'har bodd' }) suggestion!: string | null;
}

export class ReviewDraftDto {
  @ApiProperty({ type: [ReviewRemarkDto] }) items!: ReviewRemarkDto[];
  @ApiProperty({ type: String, nullable: true }) summary!: string | null;
}

export class TryReviewResponseDto extends DiagnosticResponseDto {
  @ApiProperty({ type: ReviewDraftDto, nullable: true, description: 'Null unless the outcome is ok' })
  draft!: ReviewDraftDto | null;
}
