import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

/**
 * The queue of a whole course, asked for as the set of exercises it is made of.
 *
 * The set comes from the caller because this service does not know what a course is — the
 * BFF walks the course tree with the teacher's token and sends down what it found.
 */
export class SearchReviewQueueRequestDto {
  @ApiProperty({ type: [String], description: 'Exercises whose queues to merge' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  exerciseIds!: string[];

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
