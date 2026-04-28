import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

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

  @ApiProperty({ description: 'Exercise content — shape depends on templateCode' })
  exerciseContent!: unknown;

  @ApiProperty({ description: 'Expected answers — shape depends on templateCode' })
  expectedAnswers!: unknown;

  @ApiProperty({ description: 'JSON Schema for validating submitted answers' })
  answerSchema!: unknown;

  @ApiProperty({ description: 'Merged check settings (template defaults + exercise overrides)' })
  checkSettings!: Record<string, unknown>;
}
