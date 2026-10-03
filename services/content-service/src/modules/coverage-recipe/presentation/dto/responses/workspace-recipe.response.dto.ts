import { ApiProperty } from '@nestjs/swagger';
import type { Recipe } from '@ssz/shared-kernel/skills';
import { RecipeDto } from '../recipe.dto.js';
import type { WorkspaceRecipeResult } from '../../../application/queries/get-workspace-recipe/get-workspace-recipe.handler.js';

export class WorkspaceRecipeResponseDto {
  @ApiProperty({ format: 'uuid' })
  schoolId!: string;

  @ApiProperty({
    type: RecipeDto,
    nullable: true,
    description: 'Null: the workspace has set no recipe',
  })
  recipe!: Recipe | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  updatedAt!: string | null;

  static from(result: WorkspaceRecipeResult): WorkspaceRecipeResponseDto {
    return {
      schoolId: result.schoolId,
      recipe: result.recipe,
      updatedAt: result.updatedAt?.toISOString() ?? null,
    };
  }
}
