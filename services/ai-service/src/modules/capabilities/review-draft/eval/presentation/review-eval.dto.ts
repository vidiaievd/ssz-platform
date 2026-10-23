import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class RunReviewEvalDto {
  @ApiProperty({ example: '6f1c…', description: 'Registry id of the candidate model; it need not be switched on' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelId!: string;

  @ApiPropertyOptional({ example: 'review_draft@1', description: "Prompt version to run; omitted = the binding's" })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  promptVersion?: string;

  @ApiPropertyOptional({ example: 100, description: 'How many of the newest settled drafts to take (1–500, default 100)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class BindingRefDto {
  @ApiProperty() primaryModelId!: string;
  @ApiProperty({ type: String, nullable: true }) fallbackModelId!: string | null;
  @ApiProperty({ example: 'review_draft@1' }) promptVersion!: string;
}

export class RunTotalsDto {
  @ApiProperty({ description: 'Remarks the teachers kept (accepted or edited)' }) confirmed!: number;
  @ApiProperty({ description: '…found by the candidate, same fragment and aspect' }) confirmedFound!: number;
  @ApiProperty({ description: '…found on the same fragment, any aspect' }) confirmedFoundAnyAspect!: number;
  @ApiProperty({ description: 'Remarks the teachers threw out' }) rejected!: number;
  @ApiProperty({ description: '…repeated by the candidate' }) rejectedRepeated!: number;
  @ApiProperty({ description: 'Sentences the teachers decided on' }) sentences!: number;
  @ApiProperty({ description: '…where remark / no remark matches the verdict' }) sentencesAgreed!: number;
  @ApiProperty({ description: "The candidate's remarks" }) remarks!: number;
  @ApiProperty({ description: '…on spots the teachers kept' }) remarksOnConfirmed!: number;
}

export class RunScoresDto {
  @ApiProperty() cases!: number;
  @ApiProperty() ok!: number;
  @ApiProperty() invalidResponse!: number;
  @ApiProperty() error!: number;
  @ApiProperty({ type: Number, nullable: true, example: 0.75, description: 'Share of kept remarks found, same fragment and aspect' })
  confirmedRecall!: number | null;
  @ApiProperty({ type: Number, nullable: true, example: 0.875 }) confirmedRecallAnyAspect!: number | null;
  @ApiProperty({ type: Number, nullable: true, example: 0.2, description: 'Share of thrown-out remarks repeated — lower is better' })
  rejectedRepeatRate!: number | null;
  @ApiProperty({ type: Number, nullable: true, example: 0.9, description: 'Per decided sentence: remark ⇔ not accepted' })
  sentenceAgreement!: number | null;
  @ApiProperty({ type: Number, nullable: true, example: 0.6, description: "Share of the candidate's remarks on kept spots" })
  remarkPrecision!: number | null;
  @ApiProperty({ type: Number, nullable: true }) remarksPerCase!: number | null;
  @ApiProperty({ type: RunTotalsDto }) totals!: RunTotalsDto;
  @ApiProperty({ type: Number, nullable: true }) avgLatencyMs!: number | null;
}

export class CostDto {
  @ApiProperty({ example: 41200 }) micros!: number;
  @ApiProperty({ example: 'USD' }) currency!: string;
}

export class EvalRunSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'review_draft' }) capability!: string;
  @ApiProperty() modelId!: string;
  @ApiProperty({ example: 'review_draft@1' }) promptVersion!: string;
  @ApiProperty({ enum: ['running', 'done', 'failed'] }) status!: string;
  @ApiProperty() startedBy!: string;
  @ApiProperty({ type: BindingRefDto, nullable: true, description: 'The binding when the run started' })
  bindingAtStart!: BindingRefDto | null;
  @ApiProperty({ enum: ['primary', 'fallback'], nullable: true, description: "This run's model and prompt version against today's binding" })
  matchesBinding!: 'primary' | 'fallback' | null;
  @ApiProperty() caseCount!: number;
  @ApiProperty({ type: Object, example: { NO_DECISIONS: 1 }, description: 'Settled drafts left out of the set, by reason' })
  skipped!: Record<string, number>;
  @ApiProperty({ type: RunScoresDto, nullable: true, description: 'Null until done' }) scores!: RunScoresDto | null;
  @ApiProperty({ type: CostDto, nullable: true, description: 'Null when a call had no price' }) cost!: CostDto | null;
  @ApiProperty({ type: String, nullable: true }) credits!: string | null;
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
  @ApiProperty() startedAt!: Date;
  @ApiProperty({ type: Date, nullable: true }) finishedAt!: Date | null;
}

export class CaseRemarkDto {
  @ApiProperty() sentenceIndex!: number;
  @ApiProperty({ example: 'grammar' }) aspect!: string;
  @ApiProperty({ enum: ['confirmed', 'confirmed_other_aspect', 'rejected', 'unjudged'] }) verdict!: string;
}

export class CaseScoreDto {
  @ApiProperty() confirmed!: number;
  @ApiProperty() confirmedFound!: number;
  @ApiProperty() confirmedFoundAnyAspect!: number;
  @ApiProperty() rejected!: number;
  @ApiProperty() rejectedRepeated!: number;
  @ApiProperty() sentences!: number;
  @ApiProperty() sentencesAgreed!: number;
  @ApiProperty({ type: [CaseRemarkDto] }) remarks!: CaseRemarkDto[];
}

export class CaseResultDto {
  @ApiProperty({ description: 'The attempt id in exercise-engine' }) caseId!: string;
  @ApiProperty({ enum: ['ok', 'invalid_response', 'error'] }) outcome!: string;
  @ApiProperty({ type: String, nullable: true }) errorCode!: string | null;
  @ApiProperty() latencyMs!: number;
  @ApiProperty({ type: CaseScoreDto, nullable: true }) score!: CaseScoreDto | null;
}

export class EvalRunDto extends EvalRunSummaryDto {
  @ApiProperty({ type: [CaseResultDto], nullable: true, description: 'Null until done' }) cases!: CaseResultDto[] | null;
}

export class EvalRunsDto {
  @ApiProperty({ type: BindingRefDto, nullable: true, description: "Today's binding; null when review_draft is not bound" })
  binding!: BindingRefDto | null;
  @ApiProperty({ type: [EvalRunSummaryDto] }) runs!: EvalRunSummaryDto[];
}
