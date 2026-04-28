import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class SubmitAnswerRequestDto {
  @ApiProperty({ description: 'Submitted answer payload — shape depends on templateCode' })
  @Allow()
  submittedAnswer!: unknown;

  @ApiProperty({ description: 'Time spent on this submission in seconds', minimum: 0 })
  @IsInt()
  @Min(0)
  timeSpentSeconds!: number;

  @ApiPropertyOptional({ description: 'BCP 47 locale for feedback localisation (e.g. "no", "en")' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  locale?: string;
}

export class FeedbackDto {
  @ApiProperty()
  summary!: string;

  @ApiPropertyOptional({ type: [String] })
  hints?: string[];

  @ApiPropertyOptional()
  correctAnswer?: unknown;
}

export class SubmitAnswerResponseDto {
  @ApiProperty()
  attemptId!: string;

  @ApiProperty()
  correct!: boolean;

  @ApiPropertyOptional({ nullable: true })
  score!: number | null;

  @ApiProperty()
  requiresReview!: boolean;

  @ApiProperty({ type: FeedbackDto })
  feedback!: FeedbackDto;
}
