import { ApiProperty } from '@nestjs/swagger';

export class GroupGapDto {
  @ApiProperty({ format: 'uuid' }) groupId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) courseId!: string | null;
  @ApiProperty({ nullable: true, type: String }) courseTitle!: string | null;
  @ApiProperty({ description: 'Learners on the roster of this group' }) students!: number;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Share of the course taught, 0..100. Null when the timetable could not be asked — ' +
      'never 0, which would read as "taught nothing".',
  })
  delivered!: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: "Median of the group's learners, 0..100. Null when nobody was measured.",
  })
  absorbed!: number | null;

  @ApiProperty({
    enum: ['ok', 'noCourse', 'noAttempts'],
    description:
      'Whether this row may be compared at all. A group without a course and a group ' +
      'nobody has attempted anything in are shown apart, not sorted to the bottom (§O7).',
  })
  state!: 'ok' | 'noCourse' | 'noAttempts';
}

export class GroupGapsResponseDto {
  @ApiProperty({ type: [GroupGapDto] }) groups!: GroupGapDto[];

  @ApiProperty({
    description: 'When the newest input behind these rows last changed.',
    example: '2026-09-13T08:00:00.000Z',
  })
  updatedAt!: string;
}
