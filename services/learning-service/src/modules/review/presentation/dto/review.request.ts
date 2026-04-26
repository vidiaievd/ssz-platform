import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class SubmitExerciseRequest {
  @ApiProperty({ format: 'uuid', description: 'Exercise being submitted' })
  @IsUUID(4)
  exerciseId!: string;

  @ApiPropertyOptional({ description: 'Free-form text answer' })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({ type: [String], description: 'Media file references' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaRefs?: string[];

  @ApiPropertyOptional({ format: 'uuid', description: 'Assignment this submission belongs to' })
  @IsOptional()
  @IsUUID(4)
  assignmentId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'School context for reviewer routing' })
  @IsOptional()
  @IsUUID(4)
  schoolId?: string;
}

export class ResubmitRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaRefs?: string[];
}

export class ReviewRequest {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED', 'REVISION_REQUESTED'] })
  @IsIn(['APPROVED', 'REJECTED', 'REVISION_REQUESTED'])
  decision!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  feedback?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  score?: number;
}
