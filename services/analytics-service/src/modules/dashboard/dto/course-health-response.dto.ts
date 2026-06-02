import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CourseHealthDto {
  @ApiProperty({ format: 'uuid' })
  courseId!: string;

  @ApiProperty({ example: 'Spanish Beginner (A1)' })
  name!: string;

  @ApiProperty({ example: 'es' })
  lang!: string;

  @ApiProperty({ example: 48, description: 'Active enrollees in this course' })
  enrollment!: number;

  @ApiProperty({ example: 0.62, description: 'Ratio 0.0–1.0: completedItems / (enrollment × leafItemCount); 0 if leafItemCount not yet populated' })
  completion!: number;

  @ApiProperty({ enum: ['up', 'down', 'flat'] })
  trend!: 'up' | 'down' | 'flat';

  @ApiPropertyOptional({ example: true, description: 'True when completion < dropoff threshold' })
  dropoff?: boolean;
}

export class GetCourseHealthResponseDto {
  @ApiProperty({ type: [CourseHealthDto] })
  courses!: CourseHealthDto[];
}
