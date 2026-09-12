import { ApiProperty } from '@nestjs/swagger';

export class CourseResultCellDto {
  @ApiProperty() skill!: string;
  @ApiProperty() focus!: string;

  @ApiProperty({ description: 'Attempts recorded in this cell, by anybody' })
  attempts!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Weighted success rate across learners, 0..100 — null when nothing was weighed',
  })
  ewma!: number | null;

  @ApiProperty({
    description:
      'How many learners stand behind the number. A cell of one is one person’s profile ' +
      'wearing the course’s name, and the screen is told so rather than left to guess',
  })
  learners!: number;

  @ApiProperty({ description: 'Evidence behind the cell, on the profile scale' })
  weightedSample!: number;
}

export class CourseResultResponseDto {
  @ApiProperty() containerId!: string;

  @ApiProperty({ description: 'Below this much evidence a cell carries no verdict' })
  minWeightedSample!: number;

  @ApiProperty({ description: 'Learners with any recorded result on this course' })
  learners!: number;

  @ApiProperty({ description: 'Groups whose attempts on this course were recorded' })
  groups!: number;

  @ApiProperty({
    type: [CourseResultCellDto],
    description:
      'Only cells anybody has attempted. `items` is deliberately absent — it belongs to ' +
      'the coverage report loaded beside this one, and two sources for "how many ' +
      'exercises" would part company after the next publish (plan 58 §2 C)',
  })
  cells!: CourseResultCellDto[];
}
