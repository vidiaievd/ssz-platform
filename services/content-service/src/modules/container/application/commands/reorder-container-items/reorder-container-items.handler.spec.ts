import { ReorderContainerItemsHandler } from './reorder-container-items.handler.js';
import { ReorderContainerItemsCommand } from './reorder-container-items.command.js';
import { ContainerEntity } from '../../../domain/entities/container.entity.js';
import { ContainerVersionEntity } from '../../../domain/entities/container-version.entity.js';
import { ContainerItemEntity } from '../../../domain/entities/container-item.entity.js';
import { ContainerSectionEntity } from '../../../domain/entities/container-section.entity.js';
import { ContainerType } from '../../../domain/value-objects/container-type.vo.js';
import { DifficultyLevel } from '../../../domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../domain/value-objects/visibility.vo.js';
import { AccessTier } from '../../../domain/value-objects/access-tier.vo.js';
import { ContainerItemType } from '../../../domain/value-objects/item-type.vo.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerVersionRepository } from '../../../domain/repositories/container-version.repository.interface.js';
import type { IContainerItemRepository } from '../../../domain/repositories/container-item.repository.interface.js';
import type { IContainerSectionRepository } from '../../../domain/repositories/container-section.repository.interface.js';

const OWNER_ID = 'owner-1';
const VERSION_ID = 'version-1';
const CONTAINER_ID = 'container-1';
const SECTION_ID = 'section-1';

function makeContainer(): ContainerEntity {
  const result = ContainerEntity.create({
    containerType: ContainerType.COURSE,
    targetLanguage: 'nb',
    difficultyLevel: DifficultyLevel.A1,
    title: 'Norwegian for Beginners',
    ownerUserId: OWNER_ID,
    visibility: Visibility.PRIVATE,
    accessTier: AccessTier.ASSIGNED_ONLY,
  });
  if (result.isFail) throw new Error('failed to build fixture container');
  return result.value;
}

function makeVersion(): ContainerVersionEntity {
  return ContainerVersionEntity.create(
    { containerId: CONTAINER_ID, versionNumber: 1, createdByUserId: OWNER_ID },
    VERSION_ID,
  );
}

function makeItems(count: number, sectionId: string | null = null): ContainerItemEntity[] {
  return Array.from({ length: count }, (_, i) =>
    ContainerItemEntity.create(
      {
        containerVersionId: VERSION_ID,
        position: i,
        itemType: ContainerItemType.LESSON,
        itemId: `lesson-${i}`,
        sectionId: sectionId ?? undefined,
      },
      `item-${i}`,
    ),
  );
}

function makeHandler(
  existingItems: ContainerItemEntity[],
  options?: { sections?: ContainerSectionEntity[]; reorderFn?: jest.Mock },
) {
  const containerRepo: IContainerRepository = {
    findById: jest.fn().mockResolvedValue(makeContainer()),
  } as unknown as IContainerRepository;

  const versionRepo: IContainerVersionRepository = {
    findById: jest.fn().mockResolvedValue(makeVersion()),
    save: jest.fn().mockResolvedValue(undefined),
  } as unknown as IContainerVersionRepository;

  const reorderFn = options?.reorderFn ?? jest.fn().mockResolvedValue(undefined);
  const itemRepo: IContainerItemRepository = {
    findByVersionId: jest.fn().mockResolvedValue(existingItems),
    reorder: reorderFn,
  } as unknown as IContainerItemRepository;

  const sectionRepo: IContainerSectionRepository = {
    findByVersionId: jest.fn().mockResolvedValue(options?.sections ?? []),
  } as unknown as IContainerSectionRepository;

  return {
    handler: new ReorderContainerItemsHandler(containerRepo, versionRepo, itemRepo, sectionRepo),
    reorderFn,
  };
}

describe('ReorderContainerItemsHandler', () => {
  it('reorders items without touching sectionId when none is provided', async () => {
    const items = makeItems(2);
    const { handler, reorderFn } = makeHandler(items);
    const command = new ReorderContainerItemsCommand(OWNER_ID, VERSION_ID, [
      { id: 'item-0', position: 1 },
      { id: 'item-1', position: 0 },
    ]);

    const result = await handler.execute(command);

    expect(result.isOk).toBe(true);
    expect(reorderFn).toHaveBeenCalledWith(VERSION_ID, command.items);
  });

  it('moves an item into a section belonging to the same version', async () => {
    const items = makeItems(2);
    const section = ContainerSectionEntity.create(
      { containerVersionId: VERSION_ID, title: 'A1', position: 0 },
      SECTION_ID,
    );
    const { handler, reorderFn } = makeHandler(items, { sections: [section] });
    const command = new ReorderContainerItemsCommand(OWNER_ID, VERSION_ID, [
      { id: 'item-0', position: 0, sectionId: SECTION_ID },
      { id: 'item-1', position: 1 },
    ]);

    const result = await handler.execute(command);

    expect(result.isOk).toBe(true);
    expect(reorderFn).toHaveBeenCalledWith(VERSION_ID, command.items);
  });

  it('ungroups an item when sectionId is explicitly null', async () => {
    const items = makeItems(1, SECTION_ID);
    const { handler, reorderFn } = makeHandler(items);
    const command = new ReorderContainerItemsCommand(OWNER_ID, VERSION_ID, [
      { id: 'item-0', position: 0, sectionId: null },
    ]);

    const result = await handler.execute(command);

    expect(result.isOk).toBe(true);
    expect(reorderFn).toHaveBeenCalledWith(VERSION_ID, command.items);
  });

  it('rejects a sectionId that does not belong to this version', async () => {
    const items = makeItems(1);
    const { handler } = makeHandler(items, { sections: [] });
    const command = new ReorderContainerItemsCommand(OWNER_ID, VERSION_ID, [
      { id: 'item-0', position: 0, sectionId: 'section-from-elsewhere' },
    ]);

    const result = await handler.execute(command);

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(ContainerDomainError.SECTION_NOT_FOUND);
  });
});
