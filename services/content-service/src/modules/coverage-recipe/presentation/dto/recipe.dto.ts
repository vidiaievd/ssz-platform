import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RECIPE_AXES } from '@ssz/shared-kernel/skills';

/**
 * Swagger's picture of `RecipeRule` from the shared kernel — documentation only.
 *
 * Validation is `readRecipe` in the kernel, not class-validator: the vocabulary of every
 * axis lives there, and a second copy in decorators would drift the first time an axis
 * gains a value.
 */
export class RecipeRuleDto {
  @ApiProperty({ enum: RECIPE_AXES, example: 'output' })
  axis!: string;

  @ApiProperty({
    type: [String],
    example: ['none'],
    description: 'Values of the axis this rule counts. Must belong to the axis.',
  })
  values!: string[];

  @ApiPropertyOptional({
    example: true,
    description: 'Count elements whose value is none of `values` ("output is not none").',
  })
  negate?: boolean;

  @ApiPropertyOptional({
    minimum: 1,
    example: 1,
    description: 'At least this many elements must match. Exactly one of min / maxShare.',
  })
  min?: number;

  @ApiPropertyOptional({
    minimum: 0,
    exclusiveMaximum: true,
    maximum: 1,
    example: 0.6,
    description:
      'At most this share of the lesson’s elements may match. Exactly one of min / maxShare.',
  })
  maxShare?: number;
}

export class RecipeDto {
  @ApiProperty({ type: [RecipeRuleDto], maxItems: 20 })
  rules!: RecipeRuleDto[];
}
