import { jest } from '@jest/globals';
import { EMPTY_RECIPE, RECIPE_PRESETS, type Recipe } from '@ssz/shared-kernel/skills';
import { GetContainerCoverageRecipeHandler } from './get-container-coverage-recipe.handler.js';
import { GetContainerCoverageRecipeQuery } from './get-container-coverage-recipe.query.js';
import { SetContainerCoverageRecipeHandler } from '../../commands/set-coverage-recipe/set-container-coverage-recipe.handler.js';
import { SetContainerCoverageRecipeCommand } from '../../commands/set-coverage-recipe/set-container-coverage-recipe.command.js';
import { ContainerEntity } from '../../../domain/entities/container.entity.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { ContainerType } from '../../../domain/value-objects/container-type.vo.js';
import { DifficultyLevel } from '../../../domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../domain/value-objects/visibility.vo.js';
import { AccessTier } from '../../../domain/value-objects/access-tier.vo.js';
import { WorkspaceCoverageRecipeEntity } from '../../../../coverage-recipe/domain/entities/workspace-coverage-recipe.entity.js';

const SCHOOL = 'school-1';
const workspaceRecipe: Recipe = RECIPE_PRESETS.balanced_a1_a2;
const ownRecipe: Recipe = { rules: [{ axis: 'input', values: ['audio'], min: 2 }] };

function course(ownerSchoolId: string | null = SCHOOL): ContainerEntity {
  const created = ContainerEntity.create({
    containerType: ContainerType.COURSE,
    targetLanguage: 'nb',
    difficultyLevel: DifficultyLevel.A2,
    title: 'Ny i Norge — A2',
    ownerUserId: 'author-1',
    ownerSchoolId: ownerSchoolId ?? undefined,
    visibility: ownerSchoolId ? Visibility.SCHOOL_PRIVATE : Visibility.PRIVATE,
    accessTier: AccessTier.ASSIGNED_ONLY,
  });
  if (created.isFail) throw new Error(String(created.error));
  return created.value;
}

function makeHandler(
  container: ContainerEntity | null,
  workspace: Recipe | null = workspaceRecipe,
) {
  const containers = { findById: jest.fn(() => Promise.resolve(container)) };
  const workspaces = {
    findBySchoolId: jest.fn(() =>
      Promise.resolve(
        workspace === null
          ? null
          : WorkspaceCoverageRecipeEntity.reconstitute(SCHOOL, {
              recipe: workspace,
              updatedAt: new Date(),
              updatedByUserId: 'admin-1',
            }),
      ),
    ),
  };
  return {
    handler: new GetContainerCoverageRecipeHandler(containers as never, workspaces as never),
    workspaces,
  };
}

const query = new GetContainerCoverageRecipeQuery('course-1');

describe('GetContainerCoverageRecipeHandler', () => {
  it('applies the workspace’s recipe when the course has none of its own', async () => {
    const { handler } = makeHandler(course());

    const result = await handler.execute(query);

    expect(result.value).toEqual({
      recipe: workspaceRecipe,
      inherited: workspaceRecipe,
      overridden: false,
    });
  });

  it('reports the override and the inherited recipe side by side', async () => {
    const container = course();
    container.setCoverageRecipe(ownRecipe);
    const { handler } = makeHandler(container);

    const result = await handler.execute(query);

    expect(result.value).toEqual({
      recipe: ownRecipe,
      inherited: workspaceRecipe,
      overridden: true,
    });
  });

  /** "Opted out" and "inherits nothing" must stay two different answers. */
  it('keeps an empty override as an override', async () => {
    const container = course();
    container.setCoverageRecipe({ rules: [] });
    const { handler } = makeHandler(container);

    const result = await handler.execute(query);

    expect(result.value).toEqual({
      recipe: EMPTY_RECIPE,
      inherited: workspaceRecipe,
      overridden: true,
    });
  });

  it('checks against nothing when neither the course nor its workspace set a recipe', async () => {
    const { handler } = makeHandler(course(), null);

    const result = await handler.execute(query);

    expect(result.value).toEqual({ recipe: EMPTY_RECIPE, inherited: null, overridden: false });
  });

  /** Decision of 02.10.2026: no guessing a tutor's SOLO workspace from the owner. */
  it('inherits nothing for a course that belongs to no school', async () => {
    const { handler, workspaces } = makeHandler(course(null));

    const result = await handler.execute(query);

    expect(result.value).toEqual({ recipe: EMPTY_RECIPE, inherited: null, overridden: false });
    expect(workspaces.findBySchoolId).not.toHaveBeenCalled();
  });

  it('reports a missing course as missing', async () => {
    const { handler } = makeHandler(null);

    const result = await handler.execute(query);

    expect(result.error).toBe(ContainerDomainError.CONTAINER_NOT_FOUND);
  });
});

describe('SetContainerCoverageRecipeHandler', () => {
  function makeSetter(container: ContainerEntity | null) {
    const containers = {
      findById: jest.fn(() => Promise.resolve(container)),
      save: jest.fn(() => Promise.resolve()),
    };
    const auditLog = { record: jest.fn(() => Promise.resolve()) };
    return {
      handler: new SetContainerCoverageRecipeHandler(containers as never, auditLog as never),
      containers,
      auditLog,
    };
  }

  it('sets the course’s own recipe and records who did it', async () => {
    const container = course();
    const { handler, containers, auditLog } = makeSetter(container);

    const result = await handler.execute(
      new SetContainerCoverageRecipeCommand('author-1', 'course-1', ownRecipe),
    );

    expect(result.isOk).toBe(true);
    expect(container.coverageRecipe).toEqual(ownRecipe);
    expect(containers.save).toHaveBeenCalled();
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ changedFields: ['coverageRecipe'] }),
    );
  });

  it('gives the recipe back to the workspace on null', async () => {
    const container = course();
    container.setCoverageRecipe(ownRecipe);
    const { handler } = makeSetter(container);

    await handler.execute(new SetContainerCoverageRecipeCommand('author-1', 'course-1', null));

    expect(container.coverageRecipe).toBeNull();
  });

  /** One bad rule refuses the recipe; storing the rest would save what nobody wrote. */
  it('refuses a recipe with a rule that does not parse', async () => {
    const container = course();
    const { handler, containers } = makeSetter(container);

    for (const recipe of [
      { rules: [{ axis: 'retrieval', values: ['select'], maxShare: 0.6 }] },
      { rules: [{ axis: 'input', values: ['audio'], min: 1, maxShare: 0.5 }] },
      { rules: 'all' },
    ]) {
      const result = await handler.execute(
        new SetContainerCoverageRecipeCommand('author-1', 'course-1', recipe),
      );
      expect(result.error).toBe(ContainerDomainError.INVALID_COVERAGE_RECIPE);
    }
    expect(containers.save).not.toHaveBeenCalled();
    expect(container.coverageRecipe).toBeNull();
  });
});
