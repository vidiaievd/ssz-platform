import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { RecipeDto } from '../recipe.dto.js';

export class SetWorkspaceRecipeRequestDto {
  @ApiProperty({
    type: RecipeDto,
    description: 'The whole recipe; `{ "rules": [] }` is a standard that asks for nothing',
  })
  @IsObject()
  recipe!: object;
}
