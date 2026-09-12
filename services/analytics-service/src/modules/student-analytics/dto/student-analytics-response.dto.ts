import { ApiProperty } from '@nestjs/swagger';
import type { CellState } from '@ssz/shared-kernel/analytics';

export class StudentGridCellDto {
  @ApiProperty() skill!: string;
  @ApiProperty() focus!: string;

  @ApiProperty({ description: 'Computed by @ssz/shared-kernel/analytics, never by a screen' })
  state!: CellState;

  @ApiProperty({ type: Number, nullable: true, description: 'Weighted success rate, 0..100' })
  ewma!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Days a right answer survives — the number behind "forgets fast"',
  })
  meanStability!: number | null;

  @ApiProperty() attempts!: number;
  @ApiProperty({ description: 'Evidence behind the verdict, on the profile scale' })
  weightedSample!: number;
}

export class StudentGridResponseDto {
  @ApiProperty() studentId!: string;
  @ApiProperty({ type: String, nullable: true }) courseId!: string | null;

  @ApiProperty({ description: 'Below this much evidence the profile refuses to judge' })
  minWeightedSample!: number;

  @ApiProperty({
    description: 'Content could not be asked what the course trains; no cell claims noContent',
  })
  coverageUnavailable!: boolean;

  @ApiProperty({
    description:
      'True when this learner has no attempt at all — the screen prints its empty state ' +
      'instead of a grid, because an empty grid reads as "everything is bad"',
  })
  nothingMeasured!: boolean;

  @ApiProperty({
    description:
      'Attempts in a channel the grid does not draw — reported so the screen can say how ' +
      'many it could not place, rather than being quietly short by that many',
  })
  unclassifiedAttempts!: number;

  @ApiProperty({
    type: [StudentGridCellDto],
    description: 'Four channels by five subjects — the fifth subject is the unknown bucket',
  })
  cells!: StudentGridCellDto[];
}

export class StudentPositionResponseDto {
  @ApiProperty({ description: "This learner's share of the taught course, 0..100" })
  own!: number;

  @ApiProperty({ description: 'The group median of the same number, 0..100' })
  groupMedian!: number;

  @ApiProperty({ description: 'Share of measured classmates below this learner, 0..100' })
  percentile!: number;

  @ApiProperty({ description: 'How many classmates are below — a count, never a name' })
  lowerThan!: number;

  @ApiProperty({
    enum: ['below', 'middle', 'above'],
    description: 'The band a learner may be shown (§3.6); wide enough to survive one homework',
  })
  band!: 'below' | 'middle' | 'above';

  @ApiProperty({ description: 'Classmates with a number of their own, this learner included' })
  measured!: number;
}

export class StudentWorkContextBucketDto {
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['homework', 'self_study', 'classwork', null],
    description: 'null is its own bucket: nobody said where the work was done',
  })
  key!: 'homework' | 'self_study' | 'classwork' | null;

  @ApiProperty() attempts!: number;
  @ApiProperty({ description: "Share of this learner's attempts, 0..100" }) share!: number;

  @ApiProperty({ type: Number, nullable: true, description: 'Their own pass rate, 0..100' })
  median!: number | null;
}

export class StudentWorkContextResponseDto {
  @ApiProperty() studentId!: string;
  @ApiProperty({ type: String, nullable: true }) courseId!: string | null;
  @ApiProperty({ type: [StudentWorkContextBucketDto] }) buckets!: StudentWorkContextBucketDto[];

  @ApiProperty({
    description:
      'Attempts of this learner naming no course, and so in no bucket — nearly all of ' +
      'them older than the day the column was added. Shown so that a learner with ' +
      'eighty attempts and an empty bar is not read as a learner who has done nothing',
  })
  unattributed!: number;
}
