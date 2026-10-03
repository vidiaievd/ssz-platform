import { jest } from '@jest/globals';
import { RECIPE_PRESETS } from '@ssz/shared-kernel/skills';
import { SetWorkspaceRecipeHandler } from './set-workspace-recipe.handler.js';
import { SetWorkspaceRecipeCommand } from './set-workspace-recipe.command.js';
import { CoverageRecipeDomainError } from '../../../domain/exceptions/coverage-recipe-domain.exceptions.js';
import type { WorkspaceCoverageRecipeEntity } from '../../../domain/entities/workspace-coverage-recipe.entity.js';

function makeHandler() {
  const recipes = {
    save: jest.fn<(entity: WorkspaceCoverageRecipeEntity) => Promise<void>>(() =>
      Promise.resolve(),
    ),
  };
  return { handler: new SetWorkspaceRecipeHandler(recipes as never), recipes };
}

describe('SetWorkspaceRecipeHandler', () => {
  it('stores a preset as the workspace’s recipe, with who set it', async () => {
    const { handler, recipes } = makeHandler();

    const result = await handler.execute(
      new SetWorkspaceRecipeCommand('admin-1', 'school-1', RECIPE_PRESETS.exam_b1),
    );

    expect(result.isOk).toBe(true);
    const saved = recipes.save.mock.calls[0][0];
    expect(saved.schoolId).toBe('school-1');
    expect(saved.recipe).toEqual(RECIPE_PRESETS.exam_b1);
    expect(saved.updatedByUserId).toBe('admin-1');
  });

  /** A standard that asks for nothing is a choice, not an error. */
  it('stores an empty recipe', async () => {
    const { handler, recipes } = makeHandler();

    const result = await handler.execute(
      new SetWorkspaceRecipeCommand('admin-1', 'school-1', { rules: [] }),
    );

    expect(result.isOk).toBe(true);
    expect(recipes.save).toHaveBeenCalled();
  });

  it('refuses a recipe with a rule that does not parse', async () => {
    const { handler, recipes } = makeHandler();

    const result = await handler.execute(
      new SetWorkspaceRecipeCommand('admin-1', 'school-1', {
        rules: [{ axis: 'output', values: ['none', 'sung'], negate: true, min: 1 }],
      }),
    );

    expect(result.error).toBe(CoverageRecipeDomainError.INVALID_COVERAGE_RECIPE);
    expect(recipes.save).not.toHaveBeenCalled();
  });
});
