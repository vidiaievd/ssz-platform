import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { CheckMode } from '../../domain/entities/attempt.entity.js';

export class StartAttemptRequestDto {
  @ApiProperty({ description: 'Target language code for instructions (e.g. "no", "en")' })
  @IsString()
  @IsNotEmpty()
  language!: string;

  @ApiPropertyOptional({ description: 'Assignment ID linking this attempt to a tutor assignment' })
  @IsString()
  @IsOptional()
  assignmentId?: string;

  @ApiPropertyOptional({ description: 'Enrollment ID linking this attempt to a school enrollment' })
  @IsString()
  @IsOptional()
  enrollmentId?: string;

  @ApiPropertyOptional({
    enum: ['PRACTICE', 'GRADED'],
    description:
      'PRACTICE ships expectedAnswers for instant local checking; GRADED withholds them. ' +
      'Defaults to GRADED when assignmentId is set, PRACTICE otherwise.',
  })
  @IsEnum(['PRACTICE', 'GRADED'])
  @IsOptional()
  mode?: CheckMode;
}

export class StartAttemptResponseDto {
  @ApiProperty()
  attemptId!: string;

  @ApiProperty()
  templateCode!: string;

  @ApiProperty()
  targetLanguage!: string;

  @ApiProperty()
  difficultyLevel!: string;

  @ApiProperty({ enum: ['PRACTICE', 'GRADED'] })
  checkMode!: string;

  @ApiProperty({ description: 'Exercise content — shape depends on templateCode' })
  exerciseContent!: unknown;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Expected answers — shape depends on templateCode; null when checkMode is GRADED',
  })
  expectedAnswers!: unknown;

  @ApiProperty({ description: 'JSON Schema for validating submitted answers' })
  answerSchema!: unknown;

  @ApiProperty({ description: 'Merged check settings (template defaults + exercise overrides)' })
  checkSettings!: Record<string, unknown>;

  @ApiProperty({
    description:
      'Answers already handed in on this attempt, oldest first. Empty for a fresh ' +
      'attempt; only `short_answer` takes answers before the attempt closes, so only ' +
      'a resumed set arrives with anything here.',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        questionId: { type: 'string' },
        text: { type: 'string' },
        verdict: { type: 'string', enum: ['pass', 'partial', 'fail'] },
      },
    },
  })
  answeredQuestions!: Array<{ questionId: string; text: string; verdict: string }>;
}
