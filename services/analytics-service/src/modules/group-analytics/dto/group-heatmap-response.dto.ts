import { ApiProperty } from '@nestjs/swagger';
import type { CellState } from '@ssz/shared-kernel/analytics';

export class HeatmapUnitDto {
  @ApiProperty() unitId!: string;

  @ApiProperty({ description: 'Position in the course, from 1 — the column header' })
  no!: number;

  @ApiProperty() title!: string;
}

export class HeatmapCellDto {
  @ApiProperty({ description: 'Computed by @ssz/shared-kernel/analytics, never by a screen' })
  state!: CellState;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Share of the unit this learner passed, 0..100 — null whenever unmeasured',
  })
  value!: number | null;

  @ApiProperty({ description: 'Evidence behind the verdict, on the profile scale' })
  weightedSample!: number;
}

export class HeatmapRowDto {
  @ApiProperty() studentId!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ type: String, nullable: true }) lastActivityAt!: string | null;

  @ApiProperty({
    type: [HeatmapCellDto],
    description: 'Strictly one per unit, in the order of `units`',
  })
  cells!: HeatmapCellDto[];
}

export class GroupHeatmapResponseDto {
  @ApiProperty() groupId!: string;

  @ApiProperty({ type: String, nullable: true, description: 'null → the group teaches no course' })
  courseId!: string | null;

  @ApiProperty() updatedAt!: string;

  @ApiProperty({ description: 'Below this much evidence a cell gets no verdict (§O5)' })
  minWeightedSample!: number;

  @ApiProperty({
    description: 'The timetable could not be asked; no cell is called notDelivered on a guess',
  })
  deliveryUnavailable!: boolean;

  @ApiProperty({ type: [HeatmapUnitDto] }) units!: HeatmapUnitDto[];
  @ApiProperty({ type: [HeatmapRowDto] }) rows!: HeatmapRowDto[];
}
