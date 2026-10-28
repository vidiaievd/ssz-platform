import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { BindingRefDto, CostDto } from '../../../review-draft/eval/presentation/review-eval.dto.js';

export class RunVoiceEvalDto {
  @ApiProperty({ example: '6f1c…', description: 'Registry id of the candidate speech model; it need not be switched on' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelId!: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'Hear with pronunciation scores, as `voice_review_pronunciation` does (the model must score pronunciation; ' +
      'Azure is then given the passage). Default false — measured for `voice_review`',
  })
  @IsOptional()
  @IsBoolean()
  pronunciation?: boolean;

  @ApiPropertyOptional({ example: 100, description: 'How many of the newest decided readings to take (1–500, default 100)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class ReadingGateDto {
  @ApiProperty({ example: 100 }) minPrompts!: number;
  @ApiProperty({ example: 0.85 }) minAgreement!: number;
  @ApiProperty({ description: 'At least `minPrompts` heard and agreement ≥ `minAgreement` (plan 82, Q5)' }) met!: boolean;
}

export class ReadingRunScoresDto {
  @ApiProperty() cases!: number;
  @ApiProperty({ description: 'Readings with every prompt heard' }) casesHeard!: number;
  @ApiProperty() prompts!: number;
  @ApiProperty({ description: 'Prompts heard and checked' }) heard!: number;
  @ApiProperty({ description: 'Prompts the candidate failed on' }) error!: number;
  @ApiProperty({ description: 'Prompts not heard: no recording, take too long' }) skipped!: number;
  @ApiProperty({ description: 'Heard prompts where pass / fail is the teacher’s' }) agreed!: number;
  @ApiProperty({ description: 'Machine passed, teacher failed' }) falsePass!: number;
  @ApiProperty({ description: 'Machine failed, teacher passed' }) falseFail!: number;
  @ApiProperty({ type: Number, nullable: true, example: 0.9, description: 'agreed / heard' }) agreement!: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Of the prompts teachers failed, the share passed' })
  falsePassRate!: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Of the prompts teachers passed, the share failed' })
  falseFailRate!: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Whole readings (every prompt passed) agreed, over casesHeard' })
  readingAgreement!: number | null;
  @ApiProperty({ type: Number, nullable: true, example: 94.5, description: 'Mean words-read % of prompts teachers passed' })
  meanPercentApproved!: number | null;
  @ApiProperty({ type: Number, nullable: true, example: 71.2, description: 'Mean words-read % of prompts teachers failed' })
  meanPercentFailed!: number | null;
  @ApiProperty({ type: Number, nullable: true }) avgLatencyMs!: number | null;
  @ApiProperty({ description: 'Audio heard over the run' }) audioMs!: number;
  @ApiProperty({ type: ReadingGateDto }) gate!: ReadingGateDto;
}

export class VoiceEvalRunSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['voice_review', 'voice_review_pronunciation'] }) capability!: string;
  @ApiProperty() modelId!: string;
  @ApiProperty({ example: '-', description: "The binding's label at the start; `-` when unbound (a speech model has no prompt)" })
  promptVersion!: string;
  @ApiProperty({ enum: ['running', 'done', 'failed'] }) status!: string;
  @ApiProperty() startedBy!: string;
  @ApiProperty({ type: BindingRefDto, nullable: true, description: 'The binding when the run started' })
  bindingAtStart!: BindingRefDto | null;
  @ApiProperty({ enum: ['primary', 'fallback'], nullable: true, description: "This run's model against its capability's binding today" })
  matchesBinding!: 'primary' | 'fallback' | null;
  @ApiProperty() caseCount!: number;
  @ApiProperty({ type: Object, example: { NOT_READ_MODE: 2 }, description: 'Decided readings left out of the set, by reason' })
  skipped!: Record<string, number>;
  @ApiProperty({ type: ReadingRunScoresDto, nullable: true, description: 'Null until done' }) scores!: ReadingRunScoresDto | null;
  @ApiProperty({ type: CostDto, nullable: true, description: 'Null when a call had no price' }) cost!: CostDto | null;
  @ApiProperty({ type: String, nullable: true }) credits!: string | null;
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
  @ApiProperty() startedAt!: Date;
  @ApiProperty({ type: Date, nullable: true }) finishedAt!: Date | null;
}

export class PromptResultDto {
  @ApiProperty() itemId!: string;
  @ApiProperty({ enum: ['ok', 'error', 'skipped'] }) outcome!: string;
  @ApiProperty({ type: String, nullable: true, example: 'recording_missing' }) errorCode!: string | null;
  @ApiProperty() teacherApproved!: boolean;
  @ApiProperty({ type: Boolean, nullable: true }) machinePassed!: boolean | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Passage words read, whole %' }) percent!: number | null;
  @ApiProperty() latencyMs!: number;
  @ApiProperty({ type: Number, nullable: true }) audioMs!: number | null;
}

export class ReadingCaseResultDto {
  @ApiProperty({ description: 'The attempt id in exercise-engine' }) caseId!: string;
  @ApiProperty({ example: 85 }) passPercent!: number;
  @ApiProperty({ type: [PromptResultDto] }) prompts!: PromptResultDto[];
}

export class VoiceEvalRunDto extends VoiceEvalRunSummaryDto {
  @ApiProperty({ type: [ReadingCaseResultDto], nullable: true, description: 'Null until done' })
  cases!: ReadingCaseResultDto[] | null;
}

export class VoiceEvalRunsDto {
  @ApiProperty({
    type: Object,
    example: { voice_review: { primaryModelId: '…', fallbackModelId: null, promptVersion: '-' }, voice_review_pronunciation: null },
    description: "Today's binding of each voice capability; null when unbound",
  })
  bindings!: Record<string, BindingRefDto | null>;
  @ApiProperty({ type: [VoiceEvalRunSummaryDto] }) runs!: VoiceEvalRunSummaryDto[];
}
