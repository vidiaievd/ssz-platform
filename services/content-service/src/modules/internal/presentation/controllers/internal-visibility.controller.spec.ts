import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InternalController } from './internal.controller.js';
import { TaggableEntityType } from '../../../../shared/access-control/domain/types/taggable-entity-type.js';
import type { AccessibleEntity } from '../../../../shared/access-control/domain/types/accessible-entity.js';

const USER_ID = '11111111-0000-4000-8000-000000000001';
const EXERCISE_ID = '22222222-0000-4000-8000-000000000002';

const ENTITY = { id: EXERCISE_ID, entityType: TaggableEntityType.EXERCISE } as AccessibleEntity;

function makeController(
  options: { entity?: AccessibleEntity | null; allowed?: boolean; reason?: string } = {},
) {
  const { entity = ENTITY, allowed = true, reason } = options;
  const entities = { resolve: jest.fn().mockResolvedValue(entity) };
  const visibility = { canAccess: jest.fn().mockResolvedValue({ allowed, reason }) };
  return {
    controller: new InternalController({} as never, visibility as never, entities as never),
    entities,
    visibility,
  };
}

describe('InternalController.checkVisibility', () => {
  it('says whether this learner may see this item', async () => {
    const { controller, visibility } = makeController();

    await expect(controller.checkVisibility('EXERCISE', EXERCISE_ID, USER_ID)).resolves.toEqual({
      isVisible: true,
    });
    // The same verdict every guarded route runs, and asked on behalf of somebody with no
    // platform-admin powers: a service must not be able to see more than the person it
    // is asking for.
    expect(visibility.canAccess).toHaveBeenCalledWith(
      { userId: USER_ID, roles: [], isPlatformAdmin: false },
      ENTITY,
      'view',
    );
  });

  it('carries the reason for a refusal', async () => {
    const { controller } = makeController({ allowed: false, reason: 'private' });

    await expect(controller.checkVisibility('EXERCISE', EXERCISE_ID, USER_ID)).resolves.toEqual({
      isVisible: false,
      reason: 'private',
    });
  });

  // The two must stay distinguishable: "no such exercise" is a fact about the catalogue,
  // "not visible" is a fact about the person. Learning Service skips a learner on the
  // second and fails the whole command on the first.
  it('404s on an item that does not exist, rather than calling it invisible', async () => {
    const { controller } = makeController({ entity: null });

    await expect(
      controller.checkVisibility('EXERCISE', EXERCISE_ID, USER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps the caller’s content type onto an entity type', async () => {
    const { controller, entities } = makeController();

    await controller.checkVisibility('VOCABULARY_LIST', EXERCISE_ID, USER_ID);

    expect(entities.resolve).toHaveBeenCalledWith(TaggableEntityType.VOCABULARY_LIST, EXERCISE_ID);
  });

  it('rejects a type it does not know and a missing user', async () => {
    const { controller } = makeController();

    await expect(
      controller.checkVisibility('PODCAST', EXERCISE_ID, USER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.checkVisibility('EXERCISE', EXERCISE_ID, undefined as unknown as string),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
