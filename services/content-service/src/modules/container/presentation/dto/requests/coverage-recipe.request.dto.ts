import { ApiProperty } from '@nestjs/swagger';
import { IsObject, ValidateIf } from 'class-validator';
import { RecipeDto } from '../../../../coverage-recipe/presentation/dto/recipe.dto.js';

/**
 * The course's own recipe, or `null` to go back to the workspace's.
 *
 * `ValidateIf` rather than `IsOptional`, as on the response promise: null is a meaningful
 * value and an absent field is a request that says nothing. `{ "rules": [] }` is the third
 * state — a course that opts out of the workspace's recipe.
 */
export class SetContainerCoverageRecipeRequestDto {
  @ApiProperty({
    type: RecipeDto,
    nullable: true,
    description: 'Null inherits the workspace’s recipe; an empty one opts out of it',
  })
  @ValidateIf((_, value) => value !== null)
  @IsObject()
  recipe!: object | null;
}
