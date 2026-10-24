import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MySubmissionPathDto {
  @ApiProperty({ example: 'Ny i Norge — A2' })
  course!: string;

  @ApiPropertyOptional({ nullable: true, example: 'Leksjon 19' })
  module!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Familien' })
  exercise!: string | null;
}

export class MySubmissionDecisionDto {
  @ApiProperty({ enum: ['approved', 'returned'] })
  verdict!: 'approved' | 'returned';

  @ApiProperty({
    enum: ['teacher', 'ai'],
    description: 'A teacher, or a model reviewing the work of a learner nobody reviews — to be labelled as AI.',
  })
  by!: 'teacher' | 'ai';

  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    description: 'The teacher; null for a model’s verdict. Names come from `GET /api/v1/profiles?userIds=`.',
  })
  byUserId!: string | null;

  @ApiProperty({ example: '2026-10-24T10:00:00.000Z' })
  at!: string;

  @ApiPropertyOptional({ nullable: true, example: 'Se på perfektum.' })
  comment!: string | null;

  @ApiProperty({
    example: false,
    description: 'The teacher sent or edited a model’s draft rather than writing the review from scratch.',
  })
  aiDrafted!: boolean;
}

export class MySubmissionDto {
  @ApiProperty({ format: 'uuid' })
  attemptId!: string;

  @ApiProperty({ format: 'uuid' })
  exerciseId!: string;

  @ApiProperty({ example: 'writing_task' })
  templateCode!: string;

  @ApiProperty({ example: 'no' })
  targetLanguage!: string;

  @ApiPropertyOptional({
    type: MySubmissionPathDto,
    nullable: true,
    description: 'Course · module · exercise as they read when the work was started.',
  })
  exercisePath!: MySubmissionPathDto | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  containerId!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    description: 'The school it was handed in under; null for a learner without one.',
  })
  schoolId!: string | null;

  @ApiProperty({ example: '2026-10-24T09:00:00.000Z' })
  submittedAt!: string;

  @ApiProperty({
    enum: ['pending', 'returned', 'approved'],
    description: 'Waiting for a reviewer, sent back to be rewritten, or accepted.',
  })
  status!: 'pending' | 'returned' | 'approved';

  @ApiProperty({ example: 1 })
  attemptNo!: number;

  @ApiPropertyOptional({ type: MySubmissionDecisionDto, nullable: true })
  decision!: MySubmissionDecisionDto | null;

  @ApiProperty({ description: 'Only on the returned row a new attempt at this exercise would resume.' })
  canResubmit!: boolean;
}

export class MySubmissionsResponseDto {
  @ApiProperty({ type: [MySubmissionDto] })
  items!: MySubmissionDto[];

  @ApiPropertyOptional({ nullable: true, description: 'Pass as `cursor` for the next page; null on the last one.' })
  nextCursor!: string | null;
}
