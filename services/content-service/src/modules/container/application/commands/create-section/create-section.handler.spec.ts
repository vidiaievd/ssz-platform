import { CreateSectionHandler } from './create-section.handler.js';
import { CreateSectionCommand } from './create-section.command.js';
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

function makeHandler(overrides?: {
  container?: ContainerEntity | null;
  version?: ContainerVersionEntity | null;
  existingSections?: ContainerSectionEntity[];
  maxPosition?: number;
}): CreateSectionHandler {
  const containerRepo: IContainerRepository = {
    findById: jest.fn().mockResolvedValue(overrides?.container ?? makeContainer()),
  } as unknown as IContainerRepository;

  const versionRepo: IContainerVersionRepository = {
    findById: jest.fn().mockResolvedValue(
      overrides?.version === undefined ? makeVersion() : overrides.version,
    ),
  } as unknown as IContainerVersionRepository;

  const sectionRepo: IContainerSectionRepository = {
    findByVersionId: jest.fn().mockResolvedValue(overrides?.existingSections ?? []),
    getMaxPosition: jest.fn().mockResolvedValue(overrides?.maxPosition ?? -1),
    save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
  } as unknown as IContainerSectionRepository;

  return new CreateSectionHandler(containerRepo, versionRepo, sectionRepo);
}

describe('CreateSectionHandler', () => {
  it('creates a section appended after the last position when none is given', async () => {
    const handler = makeHandler({ maxPosition: 1 });
    const command = new CreateSectionCommand(OWNER_ID, VERSION_ID, 'A2 — Elementary');

    const result = await handler.execute(command);

    expect(result.isOk).toBe(true);
    expect(result.value.position).toBe(2);
  });

  it('creates a section at position 0 for an empty version', async () => {
    const handler = makeHandler();
    const command = new CreateSectionCommand(OWNER_ID, VERSION_ID, 'A1 — Beginner');

    const result = await handler.execute(command);

    expect(result.isOk).toBe(true);
    expect(result.value.position).toBe(0);
  });

  it('rejects an explicit position that is already occupied', async () => {
    const existing = ContainerSectionEntity.create(
      { containerVersionId: VERSION_ID, title: 'A1', position: 0 },
      'section-existing',
    );
    const handler = makeHandler({ existingSections: [existing] });
    const command = new CreateSectionCommand(OWNER_ID, VERSION_ID, 'Duplicate', 0);

    const result = await handler.execute(command);

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(ContainerDomainError.DUPLICATE_SECTION_POSITION);
  });

  it('fails when the version does not exist', async () => {
    const handler = makeHandler({ version: null });
    const command = new CreateSectionCommand(OWNER_ID, VERSION_ID, 'A1');

    const result = await handler.execute(command);

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(ContainerDomainError.VERSION_NOT_FOUND);
  });
});
