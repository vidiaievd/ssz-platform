import { AddContainerItemHandler } from './add-container-item.handler.js';
import { AddContainerItemCommand } from './add-container-item.command.js';
import { ContainerEntity } from '../../../domain/entities/container.entity.js';
import { ContainerVersionEntity } from '../../../domain/entities/container-version.entity.js';
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
const ITEM_ID = 'lesson-1';

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

function makeHandler(overrides?: { section?: ContainerSectionEntity | null }) {
  const containerRepo: IContainerRepository = {
    findById: jest.fn().mockResolvedValue(makeContainer()),
  } as unknown as IContainerRepository;

  const versionRepo: IContainerVersionRepository = {
    findById: jest.fn().mockResolvedValue(makeVersion()),
    save: jest.fn().mockResolvedValue(undefined),
  } as unknown as IContainerVersionRepository;

  const itemRepo: IContainerItemRepository = {
    findByVersionId: jest.fn().mockResolvedValue([]),
    getMaxPosition: jest.fn().mockResolvedValue(-1),
    save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
  } as unknown as IContainerItemRepository;

  const sectionRepo: IContainerSectionRepository = {
    findById: jest.fn().mockResolvedValue(overrides?.section),
  } as unknown as IContainerSectionRepository;

  return new AddContainerItemHandler(containerRepo, versionRepo, itemRepo, sectionRepo);
}

describe('AddContainerItemHandler', () => {
  it('attaches the item to a section belonging to the same version', async () => {
    const section = ContainerSectionEntity.create(
      { containerVersionId: VERSION_ID, title: 'A1', position: 0 },
      'section-1',
    );
    const handler = makeHandler({ section });
    const command = new AddContainerItemCommand(
      OWNER_ID,
      VERSION_ID,
      ContainerItemType.LESSON,
      ITEM_ID,
      undefined,
      'section-1',
    );

    const result = await handler.execute(command);

    expect(result.isOk).toBe(true);
  });

  it('rejects a sectionId that does not exist', async () => {
    const handler = makeHandler({ section: null });
    const command = new AddContainerItemCommand(
      OWNER_ID,
      VERSION_ID,
      ContainerItemType.LESSON,
      ITEM_ID,
      undefined,
      'missing-section',
    );

    const result = await handler.execute(command);

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(ContainerDomainError.SECTION_NOT_FOUND);
  });

  it('rejects a sectionId that belongs to a different version', async () => {
    const sectionFromOtherVersion = ContainerSectionEntity.create(
      { containerVersionId: 'some-other-version', title: 'A1', position: 0 },
      'section-from-elsewhere',
    );
    const handler = makeHandler({ section: sectionFromOtherVersion });
    const command = new AddContainerItemCommand(
      OWNER_ID,
      VERSION_ID,
      ContainerItemType.LESSON,
      ITEM_ID,
      undefined,
      'section-from-elsewhere',
    );

    const result = await handler.execute(command);

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(ContainerDomainError.SECTION_BELONGS_TO_DIFFERENT_VERSION);
  });
});
