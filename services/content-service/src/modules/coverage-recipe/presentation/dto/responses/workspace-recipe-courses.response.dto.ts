import { ApiProperty } from '@nestjs/swagger';
import type {
  CourseRecipeException,
  WorkspaceRecipeCoursesResult,
} from '../../../application/queries/get-workspace-recipe-courses/get-workspace-recipe-courses.handler.js';

export class CourseRecipeExceptionDto implements CourseRecipeException {
  @ApiProperty({ format: 'uuid' })
  courseId!: string;

  @ApiProperty({ example: 'Norsk B1 — eksamen' })
  title!: string;

  @ApiProperty({
    enum: ['own', 'none'],
    description: 'own: the course keeps a recipe of its own; none: it opted out',
  })
  mode!: 'own' | 'none';

  @ApiProperty({ example: 4, description: 'Rules of its own recipe; 0 when mode is none' })
  ruleCount!: number;
}

export class WorkspaceRecipeCoursesResponseDto implements WorkspaceRecipeCoursesResult {
  @ApiProperty({ example: 6, description: 'Live courses of the workspace' })
  total!: number;

  @ApiProperty({ example: 4, description: 'Courses that follow the workspace recipe' })
  follow!: number;

  @ApiProperty({ example: 1 })
  own!: number;

  @ApiProperty({ example: 1 })
  none!: number;

  @ApiProperty({ type: [CourseRecipeExceptionDto] })
  exceptions!: CourseRecipeExceptionDto[];

  static from(result: WorkspaceRecipeCoursesResult): WorkspaceRecipeCoursesResponseDto {
    return { ...result, exceptions: result.exceptions.map((e) => ({ ...e })) };
  }
}
