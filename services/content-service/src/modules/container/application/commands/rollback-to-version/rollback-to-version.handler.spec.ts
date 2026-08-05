import { RollbackToVersionHandler } from './rollback-to-version.handler.js';
import { RollbackToVersionCommand } from './rollback-to-version.command.js';
import { ContainerEntity } from '../../../domain/entities/container.entity.js';
import { ContainerVersionEntity } from '../../../domain/entities/container-version.entity.js';
import { ContainerType } from '../../../domain/value-objects/container-type.vo.js';
import { DifficultyLevel } from '../../../domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../domain/value-objects/visibility.vo.js';
import { AccessTier } from '../../../domain/value-objects/access-tier.vo.js';
import { VersionStatus } from '../../../domain/value-objects/version-status.vo.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerVersionRepository } from '../../../domain/repositories/container-version.repository.interface.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.port.js';

const USER_ID = 'user-1';
const CONTAINER_ID = 'container-1';
const OLD_VERSION_ID = 'version-2';
const LIVE_VERSION_ID = 'version-3';

function makeContainer(currentPublishedVersionId: string | null = LIVE_VERSION_ID) {
  const result = ContainerEntity.create(
    {
      containerType: ContainerType.COURSE,
      targetLanguage: 'nb',
      difficultyLevel: DifficultyLevel.A1,
      title: 'Norwegian for Beginners',
      // Not the caller: the guard, not the handler, decides who may write.
      ownerUserId: 'someone-else',
      visibility: Visibility.PRIVATE,
      accessTier: AccessTier.ASSIGNED_ONLY,
    },
    CONTAINER_ID,
  );
  if (result.isFail) throw new Error('failed to build fixture container');
  const container = result.value;
  (
    container as unknown as { props: { currentPublishedVersionId: string | null } }
  ).props.currentPublishedVersionId = currentPublishedVersionId;
  return container;
}

function makeVersion(
  overrides: Partial<{ id: string; containerId: string; status: VersionStatus }> = {},
): ContainerVersionEntity {
  return ContainerVersionEntity.reconstitute(overrides.id ?? OLD_VERSION_ID, {
    containerId: overrides.containerId ?? CONTAINER_ID,
    versionNumber: 2,
    status: overrides.status ?? VersionStatus.DEPRECATED,
    changelog: 'Second release.',
    createdAt: new Date('2026-06-01T00:00:00Z'),
    createdByUserId: USER_ID,
    publishedAt: new Date('2026-07-01T00:00:00Z'),
    publishedByUserId: USER_ID,
    deprecatedAt: new Date('2026-08-01T00:00:00Z'),
    sunsetAt: new Date('2026-11-01T00:00:00Z'),
    archivedAt: null,
    revisionCount: 0,
  });
}

function makeHandler(overrides?: {
  container?: ContainerEntity | null;
  version?: ContainerVersionEntity | null;
}) {
  const containerRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(
        overrides?.container === undefined ? makeContainer() : overrides.container,
      ),
  } as unknown as IContainerRepository;

  const rollbackToVersion = jest.fn().mockResolvedValue({
    sunsetAt: new Date('2026-11-02T00:00:00Z'),
  });
  const versionRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(overrides?.version === undefined ? makeVersion() : overrides.version),
    rollbackToVersion,
  } as unknown as IContainerVersionRepository;

  const publish = jest.fn().mockResolvedValue(undefined);
  const eventPublisher = { publish } as unknown as IEventPublisher;

  return {
    handler: new RollbackToVersionHandler(containerRepo, versionRepo, eventPublisher),
    rollbackToVersion,
    publish,
  };
}

const command = new RollbackToVersionCommand(USER_ID, CONTAINER_ID, OLD_VERSION_ID);

describe('RollbackToVersionHandler', () => {
  it('puts the superseded version back on air and deprecates the live one', async () => {
    const { handler, rollbackToVersion } = makeHandler();

    const result = await handler.execute(command);

    expect(result.isOk).toBe(true);
    expect(result.value).toEqual({
      versionId: OLD_VERSION_ID,
      previousVersionId: LIVE_VERSION_ID,
    });
    expect(rollbackToVersion).toHaveBeenCalledWith({
      versionId: OLD_VERSION_ID,
      containerId: CONTAINER_ID,
      previousVersionId: LIVE_VERSION_ID,
      sunsetDays: 90,
      publishedByUserId: USER_ID,
    });
  });

  it('announces the rollback as a publish, so readers downstream follow it', async () => {
    const { handler, publish } = makeHandler();

    await handler.execute(command);

    expect(publish).toHaveBeenCalledWith(
      'content.container.published',
      expect.objectContaining({
        payload: expect.objectContaining({
          containerId: CONTAINER_ID,
          newVersionId: OLD_VERSION_ID,
          previousVersionId: LIVE_VERSION_ID,
        }),
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      'content.container.deprecated',
      expect.objectContaining({
        payload: expect.objectContaining({ versionId: LIVE_VERSION_ID }),
      }),
    );
  });

  it('refuses a version belonging to another container', async () => {
    // The guard authorized the container in the URL, not this version — without
    // the check it would publish content the caller may have no rights over.
    const { handler, rollbackToVersion } = makeHandler({
      version: makeVersion({ containerId: 'other-container' }),
    });

    const result = await handler.execute(command);

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(ContainerDomainError.VERSION_NOT_FOUND);
    expect(rollbackToVersion).not.toHaveBeenCalled();
  });

  it('refuses a version that was never live', async () => {
    const { handler, rollbackToVersion } = makeHandler({
      version: makeVersion({ status: VersionStatus.DRAFT }),
    });

    const result = await handler.execute(command);

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(ContainerDomainError.VERSION_NOT_IN_DEPRECATED_STATUS);
    expect(rollbackToVersion).not.toHaveBeenCalled();
  });

  it('refuses the version that is already live', async () => {
    const { handler } = makeHandler({ version: makeVersion({ status: VersionStatus.PUBLISHED }) });

    const result = await handler.execute(command);

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(ContainerDomainError.VERSION_NOT_IN_DEPRECATED_STATUS);
  });

  it('reports a missing container', async () => {
    const { handler } = makeHandler({ container: null });

    const result = await handler.execute(command);

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(ContainerDomainError.CONTAINER_NOT_FOUND);
  });
});
