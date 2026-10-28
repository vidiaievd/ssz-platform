import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { BindingRefDto, CostDto } from '../../../review-draft/eval/presentation/review-eval.dto.js';

export class RunAssistEvalDto {
  @ApiProperty({ example: '6f1c…', description: 'Registry id of the candidate model; it need not be switched on' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelId!: string;

  @ApiPropertyOptional({ example: 'student_assist@1', description: "Prompt version to run; omitted = the binding's" })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  promptVersion?: string;
}

export class GroundedTotalsDto {
  @ApiProperty() cases!: number;
  @ApiProperty() answered!: number;
  @ApiProperty({ description: 'Answered citing anything' }) cited!: number;
  @ApiProperty({ description: 'Answered citing what the case expects' }) expectedCited!: number;
}

export class KeySeekingTotalsDto {
  @ApiProperty() cases!: number;
  @ApiProperty() answered!: number;
  @ApiProperty({ description: "Answered with the exercise's answer in it (R-g)" }) leaked!: number;
}

export class OffTopicTotalsDto {
  @ApiProperty() cases!: number;
  @ApiProperty() answered!: number;
  @ApiProperty({ description: 'Answered in one polite line: ≤ 2 blocks, no citations or suggestions, nothing asked for' })
  restrained!: number;
}

export class RejectionTotalsDto {
  @ApiProperty({ description: 'A citation no tool of the turn returned' }) citation!: number;
  @ApiProperty({ description: 'An `open` target no tool of the turn returned' }) open!: number;
  @ApiProperty({ description: 'A word to save that occurs nowhere in the turn' }) add_word!: number;
  @ApiProperty({ description: "The verifier's other checks (blank block, emphasis span)" }) other_check!: number;
  @ApiProperty({ description: 'Not the answer’s shape at all' }) schema!: number;
}

export class AssistRunScoresDto {
  @ApiProperty({ example: 'assist-set@1', description: 'The set run; runs on different sets are not compared' }) set!: string;
  @ApiProperty() cases!: number;
  @ApiProperty() answered!: number;
  @ApiProperty() silent!: number;
  @ApiProperty({ type: Number, nullable: true, example: 0.05, description: 'Cases the learner would see as «unavailable» (R-f)' })
  silentRate!: number | null;
  @ApiProperty({ type: Object, example: { invalid_response: 1 }, description: 'Silences by code' })
  silentByCause!: Record<string, number>;
  @ApiProperty({ type: GroundedTotalsDto }) grounded!: GroundedTotalsDto;
  @ApiProperty({ type: Number, nullable: true, example: 0.9, description: 'Grounded answers citing anything' })
  citationRate!: number | null;
  @ApiProperty({ type: Number, nullable: true, example: 0.8, description: 'Grounded answers citing what the case expects' })
  expectedCitationRate!: number | null;
  @ApiProperty({ type: KeySeekingTotalsDto }) keySeeking!: KeySeekingTotalsDto;
  @ApiProperty({ type: Number, nullable: true, example: 0, description: 'Answer-seeking cases that got the answer — lower is better' })
  leakRate!: number | null;
  @ApiProperty({ type: OffTopicTotalsDto }) offTopic!: OffTopicTotalsDto;
  @ApiProperty({ type: Number, nullable: true, example: 1 }) restraintRate!: number | null;
  @ApiProperty({ type: RejectionTotalsDto, description: 'Answers not accepted, by what caught them (repair rounds included)' })
  rejections!: RejectionTotalsDto;
  @ApiProperty({ description: 'Cases with at least one answer not accepted' }) casesRejected!: number;
  @ApiProperty({ type: Number, nullable: true }) rejectionRate!: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Of the rejected cases, the share the repair round saved' })
  repairRate!: number | null;
  @ApiProperty({ type: Number, nullable: true }) avgToolRounds!: number | null;
  @ApiProperty({ type: Number, nullable: true }) avgCalls!: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Per case, summed over its calls' }) avgLatencyMs!: number | null;
}

export class AssistEvalRunSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'student_assist' }) capability!: string;
  @ApiProperty() modelId!: string;
  @ApiProperty({ example: 'student_assist@1' }) promptVersion!: string;
  @ApiProperty({ enum: ['running', 'done', 'failed'] }) status!: string;
  @ApiProperty() startedBy!: string;
  @ApiProperty({ type: BindingRefDto, nullable: true, description: 'The binding when the run started' })
  bindingAtStart!: BindingRefDto | null;
  @ApiProperty({ enum: ['primary', 'fallback'], nullable: true, description: "This run's model and prompt version against today's binding" })
  matchesBinding!: 'primary' | 'fallback' | null;
  @ApiProperty() caseCount!: number;
  @ApiProperty({
    type: Object,
    example: { UNIT_MISSING: 2 },
    description: "Cases of the set left out: the stand lacks their material (COURSE_MISSING, UNIT_MISSING) or it changed (EXPECTATION_STALE)",
  })
  skipped!: Record<string, number>;
  @ApiProperty({ type: AssistRunScoresDto, nullable: true, description: 'Null until done' }) scores!: AssistRunScoresDto | null;
  @ApiProperty({ type: CostDto, nullable: true, description: 'Null when a call had no price' }) cost!: CostDto | null;
  @ApiProperty({ type: String, nullable: true }) credits!: string | null;
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
  @ApiProperty() startedAt!: Date;
  @ApiProperty({ type: Date, nullable: true }) finishedAt!: Date | null;
}

export class AssistCaseResultDto {
  @ApiProperty({ example: 'a2-17g-ikke-after-fordi', description: 'The case in `assist-eval-set.ts`' }) caseKey!: string;
  @ApiProperty({ enum: ['grounded', 'key_seeking', 'off_topic', 'general'] }) category!: string;
  @ApiProperty({ enum: ['answered', 'silent'] }) outcome!: string;
  @ApiProperty({ type: String, nullable: true, example: 'tool_budget' }) cause!: string | null;
  @ApiProperty() calls!: number;
  @ApiProperty() toolRounds!: number;
  @ApiProperty() toolCalls!: number;
  @ApiProperty({ type: [String], example: ['citation'], enum: ['citation', 'open', 'add_word', 'other_check', 'schema'] })
  rejections!: string[];
  @ApiProperty() blocks!: number;
  @ApiProperty() citations!: number;
  @ApiProperty() suggestions!: number;
  @ApiProperty({ type: Boolean, nullable: true }) expectedCited!: boolean | null;
  @ApiProperty({ type: Boolean, nullable: true }) saidForbidden!: boolean | null;
  @ApiProperty() latencyMs!: number;
}

export class AssistEvalRunDto extends AssistEvalRunSummaryDto {
  @ApiProperty({ type: [AssistCaseResultDto], nullable: true, description: 'Null until done' }) cases!: AssistCaseResultDto[] | null;
}

export class AssistEvalRunsDto {
  @ApiProperty({ type: BindingRefDto, nullable: true, description: "Today's binding; null when student_assist is not bound" })
  binding!: BindingRefDto | null;
  @ApiProperty({ type: [AssistEvalRunSummaryDto] }) runs!: AssistEvalRunSummaryDto[];
}
