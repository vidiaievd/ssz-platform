import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CellState } from '@ssz/shared-kernel/analytics';

export class UnitDeliveredDto {
  @ApiProperty({ enum: [0, 0.5, 1], description: '1 taught in full, 0.5 partly, 0 not at all' })
  value!: 0 | 0.5 | 1;

  @ApiProperty() lessons!: number;
  @ApiProperty({ type: String, nullable: true }) lastHeldAt!: string | null;

  @ApiProperty({ description: 'A plan unit names this course unit' })
  linked!: boolean;
}

export class UnitAbsorbedDto {
  @ApiProperty() median!: number;
  @ApiProperty() p25!: number;
  @ApiProperty() p75!: number;

  @ApiProperty({ description: 'Learners with any data on this unit — not roster size' })
  n!: number;
}

export class GroupProgressUnitDto {
  @ApiProperty() unitId!: string;
  @ApiProperty() no!: number;
  @ApiProperty() title!: string;
  @ApiProperty() items!: number;

  @ApiProperty({
    type: UnitDeliveredDto,
    nullable: true,
    description: 'null when the timetable could not be asked — never a zero (plan 58 §2 G)',
  })
  delivered!: UnitDeliveredDto | null;

  @ApiProperty({ type: UnitAbsorbedDto, nullable: true })
  absorbed!: UnitAbsorbedDto | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Weighted pass rate, 0..100' })
  quality!: number | null;

  @ApiProperty({ description: 'Computed by @ssz/shared-kernel/analytics, never by a screen' })
  state!: CellState;
}

export class UnlinkedPlanUnitDto {
  @ApiProperty() curriculumUnitId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() lessons!: number;
  @ApiProperty({ type: String, nullable: true }) lastHeldAt!: string | null;
}

export class GroupProgressSummaryDto {
  @ApiProperty() deliveredUnits!: number;
  @ApiProperty() plannedUnits!: number;
  @ApiProperty() lessonsHeld!: number;
  @ApiProperty() lessonsPlanned!: number;

  @ApiProperty({ type: Number, nullable: true }) absorbedMedian!: number | null;
  @ApiProperty() belowLine!: number;

  @ApiProperty({ description: 'The rule in words — it is calibration, not a UI constant' })
  belowLineRule!: string;

  @ApiProperty({ description: 'Learner × unit cells under minWeightedSample (§O5)' })
  notJudgeable!: number;

  @ApiProperty({ type: String, nullable: true }) lastActivityAt!: string | null;
}

export class WorkContextBucketDto {
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['homework', 'self_study', 'classwork', null],
    description: 'null is its own bucket: nobody said where the work was done',
  })
  key!: 'homework' | 'self_study' | 'classwork' | null;

  @ApiProperty() attempts!: number;
  @ApiProperty({ description: 'Share of the group\'s attempts, 0..100' }) share!: number;

  @ApiProperty({ type: Number, nullable: true, description: 'Median learner pass rate, 0..100' })
  median!: number | null;
}

export class GroupProgressResponseDto {
  @ApiProperty() groupId!: string;

  @ApiProperty({ type: String, nullable: true, description: 'null → the group teaches no course' })
  courseId!: string | null;

  @ApiProperty() updatedAt!: string;
  @ApiProperty() minWeightedSample!: number;

  @ApiProperty({ description: 'Left of this date every attempt is one undivided bucket' })
  workContextSplitFrom!: string;

  @ApiPropertyOptional({
    description: 'The timetable could not be asked; every delivered is null, none is zero',
  })
  deliveryUnavailable!: boolean;

  @ApiProperty({ type: [GroupProgressUnitDto] }) units!: GroupProgressUnitDto[];
  @ApiProperty({ type: [UnlinkedPlanUnitDto] }) unlinkedPlanUnits!: UnlinkedPlanUnitDto[];
  @ApiProperty({ type: GroupProgressSummaryDto }) summary!: GroupProgressSummaryDto;
  @ApiProperty({ type: [WorkContextBucketDto] }) workContext!: WorkContextBucketDto[];
}
