import { ApiProperty } from '@nestjs/swagger';
import type { ReviewGateVerdict } from '../domain/review-gate.js';

export class ReviewGateThresholdsDto {
  @ApiProperty({ description: 'Drafts teachers must have settled on the template (`AI_REVIEW_GATE_MIN_DRAFTS`)', example: 100 })
  minDrafts!: number;

  @ApiProperty({ description: 'Least share of remarks kept, as written or reworded (`AI_REVIEW_GATE_MIN_KEPT`)', example: 0.85 })
  minKept!: number;

  @ApiProperty({ description: 'Largest share of remarks thrown out (`AI_REVIEW_GATE_MAX_DISCARDED`)', example: 0.1 })
  maxDiscarded!: number;
}

export class ReviewGateRemarksDto {
  @ApiProperty({ example: 120 }) accepted!: number;
  @ApiProperty({ example: 30 }) edited!: number;
  @ApiProperty({ example: 10 }) discarded!: number;
  @ApiProperty({ description: 'Neither taken nor thrown out — in the denominator of both shares', example: 5 })
  untouched!: number;
  @ApiProperty({ example: 165 }) total!: number;
}

export class ReviewGateDirectDto {
  @ApiProperty({ description: 'Verdicts the model delivered to learners (`review_direct`, `voice_review`)', example: 40 })
  reviews!: number;

  @ApiProperty({ description: 'Of them, disputed by the learner', example: 2 })
  disputes!: number;

  @ApiProperty({ type: Number, nullable: true, description: 'disputes / reviews; null with none delivered', example: 0.05 })
  disputeRate!: number | null;

  @ApiProperty({ description: "Teachers' verdicts on work the model had answered first", example: 12 })
  teacherVerdicts!: number;

  @ApiProperty({ description: 'Of them, the other way (approved ↔ returned)', example: 1 })
  overturned!: number;

  @ApiProperty({ type: Number, nullable: true, description: 'overturned / teacherVerdicts; null with none', example: 0.0833 })
  overturnRate!: number | null;
}

export class ReviewGateGroupDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Exercise template; null = rows folded before the template was recorded',
    example: 'writing_task',
  })
  templateCode!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'ai-service registry model id', example: '7b0c…' })
  modelId!: string | null;

  @ApiProperty({ description: 'Drafts teachers acted on, `review_draft` and `review_direct` alike', example: 104 })
  drafts!: number;

  @ApiProperty({ type: ReviewGateRemarksDto })
  remarks!: ReviewGateRemarksDto;

  @ApiProperty({ type: Number, nullable: true, description: '(accepted + edited) / total, four places', example: 0.9091 })
  keptRate!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: 'discarded / total, four places', example: 0.0606 })
  discardedRate!: number | null;

  @ApiProperty({ type: ReviewGateDirectDto, description: 'Context, not part of the gate' })
  direct!: ReviewGateDirectDto;

  @ApiProperty({
    enum: ['passed', 'failed', 'insufficient', 'not_recorded'],
    description:
      '`insufficient` — fewer drafts than `minDrafts`; `not_recorded` — no template on the rows. ' +
      'Shares are compared exactly, not rounded.',
  })
  verdict!: ReviewGateVerdict;

  @ApiProperty({ description: '`verdict === passed`' })
  passed!: boolean;
}

export class ReviewGateDto {
  @ApiProperty({ type: String, nullable: true, example: null }) from!: string | null;
  @ApiProperty({ type: String, nullable: true, example: null }) to!: string | null;
  @ApiProperty({ type: ReviewGateThresholdsDto }) thresholds!: ReviewGateThresholdsDto;

  @ApiProperty({
    type: [ReviewGateGroupDto],
    description: 'Per template × model, every agent and prompt version folded; templates by name, unrecorded last',
  })
  groups!: ReviewGateGroupDto[];
}
