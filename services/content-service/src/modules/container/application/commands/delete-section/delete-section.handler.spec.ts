import { DeleteSectionHandler } from './delete-section.handler.js';
import { DeleteSectionCommand } from './delete-section.command.js';
import { ContainerEntity } from '../../../domain/entities/container.entity.js';
import { ContainerVersionEntity } from '../../../domain/entities/container-version.entity.js';
import { ContainerSectionEntity } from '../../../domain/entities/container-section.entity.js';
import { ContainerType } from '../../../domain/value-objects/container-type.vo.js';
import { DifficultyLevel } from '../../../domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../domain/value-objects/visibility.vo.js';
import { AccessTier } from '../../../domain/value-objects/access-tier.vo.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerVersionRepository } from '../../../domain/repositories/container-version.repository.interface.js';
import type { IContainerSectionRepository } from '../../../domain/repositories/container-section.repository.interface.js';

const OWNER_ID = 'owner-1';
const VERSION_ID = 'version-1';
const CONTAINER_ID = 'container-1';
const SECTION_ID = 'section-1';

function makeContainer(ownerUserId = OWNER_ID): ContainerEntity {
  const result = ContainerEntity.create({
    containerType: ContainerType.COURSE,
    targetLanguage: 'nb',
    difficultyLevel: DifficultyLevel.A1,
    title: 'Norwegian for Beginners',
    ownerUserId,
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

function makeSection(): ContainerSectionEntity {
  return ContainerSectionEntity.create(
    { containerVersionId: VERSION_ID, title: 'A1 — Beginner', position: 0 },
    SECTION_ID,
  );
}

function makeHandler(overrides?: {
  container?: ContainerEntity | null;
  version?: ContainerVersionEntity | null;
  section?: ContainerSectionEntity | null;
  unassignItems?: jest.Mock;
  deleteFn?: jest.Mock;
}) {
  const containerRepo: IContainerRepository = {
    findById: jest.fn().mockResolvedValue(overrides?.container ?? makeContainer()),
  } as unknown as IContainerRepository;

  const versionRepo: IContainerVersionRepository = {
    findById: jest.fn().mockResolvedValue(
      overrides?.version === undefined ? makeVersion() : overrides.version,
    ),
  } as unknown as IContainerVersionRepository;

  const unassignItems = overrides?.unassignItems ?? jest.fn().mockResolvedValue(undefined);
  const deleteFn = overrides?.deleteFn ?? jest.fn().mockResolvedValue(undefined);

  const sectionRepo: IContainerSectionRepository = {
    findById: jest.fn().mockResolvedValue(
      overrides?.section === undefined ? makeSection() : overrides.section,
    ),
    unassignItems,
    delete: deleteFn,
  } as unknown as IContainerSectionRepository;

  return { handler: new DeleteSectionHandler(containerRepo, versionRepo, sectionRepo), unassignItems, deleteFn };
}

describe('DeleteSectionHandler', () => {
  it('ungroups items before deleting the section, never cascading the delete to items', async () => {
    const { handler, unassignItems, deleteFn } = makeHandler();
    const command = new DeleteSectionCommand(OWNER_ID, SECTION_ID);

    const result = await handler.execute(command);

    expect(result.isOk).toBe(true);
    expect(unassignItems).toHaveBeenCalledWith(SECTION_ID);
    expect(deleteFn).toHaveBeenCalledWith(SECTION_ID);
    // Items must be ungrouped before the section row disappears.
    expect(unassignItems.mock.invocationCallOrder[0]).toBeLessThan(
      deleteFn.mock.invocationCallOrder[0],
    );
  });

  it('fails when the section does not exist', async () => {
    const { handler } = makeHandler({ section: null });
    const command = new DeleteSectionCommand(OWNER_ID, SECTION_ID);

    const result = await handler.execute(command);

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(ContainerDomainError.SECTION_NOT_FOUND);
  });
});
