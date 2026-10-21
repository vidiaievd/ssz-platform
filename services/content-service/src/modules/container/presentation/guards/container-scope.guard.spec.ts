import { NotFoundException, type ExecutionContext } from '@nestjs/common';
import { ContainerScopeGuard } from './container-scope.guard.js';
import type { IContainerVersionRepository } from '../../domain/repositories/container-version.repository.interface.js';
import type { IContainerItemRepository } from '../../domain/repositories/container-item.repository.interface.js';
import type { IContainerSectionRepository } from '../../domain/repositories/container-section.repository.interface.js';

const MINE = 'container-mine';
const VERSION = 'version-mine';

function contextWith(params: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ params }) }),
  } as unknown as ExecutionContext;
}

function makeGuard(found?: {
  versionContainerId?: string | null;
  itemVersionId?: string | null;
  sectionVersionId?: string | null;
}) {
  const pick = <K extends keyof NonNullable<typeof found>>(key: K, fallback: string) =>
    found && key in found ? found[key] : fallback;
  const versionOwner = pick('versionContainerId', MINE);
  const itemOwner = pick('itemVersionId', VERSION);
  const sectionOwner = pick('sectionVersionId', VERSION);

  const versionRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(versionOwner === null ? null : { containerId: versionOwner }),
  } as unknown as IContainerVersionRepository;
  const itemRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(itemOwner === null ? null : { containerVersionId: itemOwner }),
  } as unknown as IContainerItemRepository;
  const sectionRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(sectionOwner === null ? null : { containerVersionId: sectionOwner }),
  } as unknown as IContainerSectionRepository;

  return new ContainerScopeGuard(versionRepo, itemRepo, sectionRepo);
}

describe('ContainerScopeGuard', () => {
  it('lets through routes without a nested version', async () => {
    await expect(makeGuard().canActivate(contextWith({ containerId: MINE }))).resolves.toBe(true);
  });

  it('lets through a version, row and section that all sit in the named container', async () => {
    const params = { containerId: MINE, versionId: VERSION, itemId: 'row', sectionId: 'sec' };
    await expect(makeGuard().canActivate(contextWith(params))).resolves.toBe(true);
  });

  it('answers 404 for a version of another container', async () => {
    const guard = makeGuard({ versionContainerId: 'container-elsewhere' });
    await expect(
      guard.canActivate(contextWith({ containerId: MINE, versionId: VERSION })),
    ).rejects.toThrow(new NotFoundException('VERSION_NOT_FOUND'));
  });

  it('answers 404 for an unknown version', async () => {
    const guard = makeGuard({ versionContainerId: null });
    await expect(
      guard.canActivate(contextWith({ containerId: MINE, versionId: VERSION })),
    ).rejects.toThrow(NotFoundException);
  });

  it('answers 404 for a row of another version', async () => {
    const guard = makeGuard({ itemVersionId: 'version-elsewhere' });
    await expect(
      guard.canActivate(contextWith({ containerId: MINE, versionId: VERSION, itemId: 'row' })),
    ).rejects.toThrow(new NotFoundException('ITEM_NOT_FOUND'));
  });

  it('answers 404 for a section of another version', async () => {
    const guard = makeGuard({ sectionVersionId: 'version-elsewhere' });
    await expect(
      guard.canActivate(contextWith({ containerId: MINE, versionId: VERSION, sectionId: 'sec' })),
    ).rejects.toThrow(new NotFoundException('SECTION_NOT_FOUND'));
  });
});
