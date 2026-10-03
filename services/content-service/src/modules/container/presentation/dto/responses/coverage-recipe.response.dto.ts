import { ApiProperty } from '@nestjs/swagger';
import type { Recipe } from '@ssz/shared-kernel/skills';
import { RecipeDto } from '../../../../coverage-recipe/presentation/dto/recipe.dto.js';
import type { ContainerCoverageRecipeResult } from '../../../application/queries/get-coverage-recipe/get-container-coverage-recipe.handler.js';

export class ContainerCoverageRecipeResponseDto {
  @ApiProperty({ type: RecipeDto, description: 'What the lessons are checked against' })
  recipe!: Recipe;

  @ApiProperty({
    type: RecipeDto,
    nullable: true,
    description: 'The workspace’s recipe — what "inherit" means; null if there is none',
  })
  inherited!: Recipe | null;

  @ApiProperty({ example: false })
  overridden!: boolean;

  static from(result: ContainerCoverageRecipeResult): ContainerCoverageRecipeResponseDto {
    return {
      recipe: result.recipe,
      inherited: result.inherited,
      overridden: result.overridden,
    };
  }
}
