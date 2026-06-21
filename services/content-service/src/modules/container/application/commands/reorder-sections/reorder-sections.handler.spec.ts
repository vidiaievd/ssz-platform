import { ReorderSectionsHandler } from './reorder-sections.handler.js';
import { ReorderSectionsCommand } from './reorder-sections.command.js';
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

function makeSections(count: number): ContainerSectionEntity[] {
  return Array.from({ length: count }, (_, i) =>
    ContainerSectionEntity.create(
      { containerVersionId: VERSION_ID, title: `Section ${i}`, position: i },
      `section-${i}`,
    ),
  );
}

function makeHandler(existingSections: ContainerSectionEntity[], reorderFn = jest.fn().mockResolvedValue(undefined)) {
  const containerRepo: IContainerRepository = {
    findById: jest.fn().mockResolvedValue(makeContainer()),
  } as unknown as IContainerRepository;

  const versionRepo: IContainerVersionRepository = {
    findById: jest.fn().mockResolvedValue(makeVersion()),
  } as unknown as IContainerVersionRepository;

  const sectionRepo: IContainerSectionRepository = {
    findByVersionId: jest.fn().mockResolvedValue(existingSections),
    reorder: reorderFn,
  } as unknown as IContainerSectionRepository;

  return new ReorderSectionsHandler(containerRepo, versionRepo, sectionRepo);
}

describe('ReorderSectionsHandler', () => {
  it('reorders sections when the payload is a valid permutation covering all sections', async () => {
    const sections = makeSections(3);
    const reorderFn = jest.fn().mockResolvedValue(undefined);
    const handler = makeHandler(sections, reorderFn);
    const command = new ReorderSectionsCommand(OWNER_ID, VERSION_ID, [
      { id: 'section-0', position: 2 },
      { id: 'section-1', position: 0 },
      { id: 'section-2', position: 1 },
    ]);

    const result = await handler.execute(command);

    expect(result.isOk).toBe(true);
    expect(reorderFn).toHaveBeenCalledWith(VERSION_ID, command.sections);
  });

  it('rejects a section id that does not belong to the version', async () => {
    const sections = makeSections(2);
    const handler = makeHandler(sections);
    const command = new ReorderSectionsCommand(OWNER_ID, VERSION_ID, [
      { id: 'section-0', position: 0 },
      { id: 'section-from-elsewhere', position: 1 },
    ]);

    const result = await handler.execute(command);

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(ContainerDomainError.SECTION_NOT_FOUND);
  });

  it('rejects a payload that omits a section belonging to the version', async () => {
    const sections = makeSections(3);
    const handler = makeHandler(sections);
    const command = new ReorderSectionsCommand(OWNER_ID, VERSION_ID, [
      { id: 'section-0', position: 0 },
      { id: 'section-1', position: 1 },
    ]);

    const result = await handler.execute(command);

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(ContainerDomainError.DUPLICATE_SECTION_POSITION);
  });

  it('rejects non-continuous positions', async () => {
    const sections = makeSections(2);
    const handler = makeHandler(sections);
    const command = new ReorderSectionsCommand(OWNER_ID, VERSION_ID, [
      { id: 'section-0', position: 0 },
      { id: 'section-1', position: 5 },
    ]);

    const result = await handler.execute(command);

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(ContainerDomainError.DUPLICATE_SECTION_POSITION);
  });
});
