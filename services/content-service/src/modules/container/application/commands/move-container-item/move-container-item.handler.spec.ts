import { MoveContainerItemHandler } from './move-container-item.handler.js';
import { MoveContainerItemCommand } from './move-container-item.command.js';
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
import type { IContainerItemMover } from '../../ports/container-item-mover.port.js';
import type { EntityResolverRegistry } from '../../../../../shared/access-control/infrastructure/registry/entity-resolver-registry.js';
import type { VisibilityCheckerService } from '../../../../../shared/access-control/domain/services/visibility-checker.service.js';

const USER = { userId: 'user-1', roles: ['school_admin'], isPlatformAdmin: false };
const SOURCE_ID = 'module-17b';
const TARGET_ID = 'module-17c';
const VERSION_ID = 'version-17b';
const TARGET_DRAFT_ID = 'version-17c';
const ROW_ID = 'row-1';

function makeModule(): ContainerEntity {
  const result = ContainerEntity.create({
    containerType: ContainerType.MODULE,
    targetLanguage: 'nb',
    difficultyLevel: DifficultyLevel.A2,
    title: '17C — Maria danser',
    ownerUserId: 'someone-else',
    ownerSchoolId: 'school-1',
    visibility: Visibility.SCHOOL_PRIVATE,
    accessTier: AccessTier.ASSIGNED_ONLY,
  });
  if (result.isFail) throw new Error('failed to build fixture container');
  return result.value;
}

function makeVersion(id: string, containerId: string): ContainerVersionEntity {
  return ContainerVersionEntity.create({ containerId, versionNumber: 2, createdByUserId: 'u' }, id);
}

function makeRow(itemType = ContainerItemType.EXERCISE, versionId = VERSION_ID) {
  return ContainerItemEntity.reconstitute(ROW_ID, {
    containerVersionId: versionId,
    position: 3,
    itemType,
    itemId: 'exercise-1',
    isRequired: true,
    sectionId: 'section-17b',
    sectionLabel: null,
    xpReward: null,
    addedAt: new Date(),
  });
}

function makeHandler(overrides?: {
  version?: ContainerVersionEntity | null;
  row?: ContainerItemEntity | null;
  target?: ContainerEntity | null;
  targetDraft?: ContainerVersionEntity | null;
  section?: ContainerSectionEntity | null;
  allowed?: boolean;
  moved?: { rowId: string; position: number } | null;
}) {
  const has = <K extends keyof NonNullable<typeof overrides>>(key: K) =>
    overrides !== undefined && key in overrides;

  const containerRepo = {
    findById: jest.fn().mockResolvedValue(has('target') ? overrides!.target : makeModule()),
  } as unknown as IContainerRepository;
  const versionRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(has('version') ? overrides!.version : makeVersion(VERSION_ID, SOURCE_ID)),
    findDraftByContainerId: jest
      .fn()
      .mockResolvedValue(
        has('targetDraft') ? overrides!.targetDraft : makeVersion(TARGET_DRAFT_ID, TARGET_ID),
      ),
  } as unknown as IContainerVersionRepository;
  const itemRepo = {
    findById: jest.fn().mockResolvedValue(has('row') ? overrides!.row : makeRow()),
  } as unknown as IContainerItemRepository;
  const findSection = jest
    .fn()
    .mockResolvedValue(
      has('section')
        ? overrides!.section
        : ContainerSectionEntity.create(
            { containerVersionId: TARGET_DRAFT_ID, title: 'Øvelser', position: 1 },
            'section-17c',
          ),
    );
  const sectionRepo = { findById: findSection } as unknown as IContainerSectionRepository;
  const moveRow = jest
    .fn()
    .mockResolvedValue(has('moved') ? overrides!.moved : { rowId: 'row-moved', position: 9 });
  const mover = { moveRow } as unknown as IContainerItemMover;
  const resolve = jest.fn().mockResolvedValue({ id: TARGET_ID });
  const registry = { resolve } as unknown as EntityResolverRegistry;
  const canAccess = jest
    .fn()
    .mockResolvedValue({ allowed: has('allowed') ? overrides!.allowed : true });
  const checker = { canAccess } as unknown as VisibilityCheckerService;

  const handler = new MoveContainerItemHandler(
    containerRepo,
    versionRepo,
    itemRepo,
    sectionRepo,
    mover,
    registry,
    checker,
  );
  return { handler, moveRow, canAccess, findSection };
}

const command = (targetContainerId = TARGET_ID, targetSectionId: string | null = 'section-17c') =>
  new MoveContainerItemCommand(
    USER,
    SOURCE_ID,
    VERSION_ID,
    ROW_ID,
    targetContainerId,
    targetSectionId,
  );

describe('MoveContainerItemHandler', () => {
  it("moves the row into the target's draft section and returns the new row", async () => {
    const { handler, moveRow, canAccess } = makeHandler();

    const result = await handler.execute(command());

    expect(result.value).toEqual({ itemId: 'row-moved', position: 9 });
    expect(moveRow).toHaveBeenCalledWith({
      sourceVersionId: VERSION_ID,
      rowId: ROW_ID,
      targetVersionId: TARGET_DRAFT_ID,
      targetSectionId: 'section-17c',
    });
    // The target's rights are checked for the caller, not assumed from the route's.
    expect(canAccess).toHaveBeenCalledWith(USER, { id: TARGET_ID }, 'edit');
  });

  it('places the row outside any section without looking one up', async () => {
    const { handler, moveRow, findSection } = makeHandler();

    await handler.execute(command(TARGET_ID, null));

    expect(findSection).not.toHaveBeenCalled();
    expect(moveRow).toHaveBeenCalledWith(expect.objectContaining({ targetSectionId: null }));
  });

  it('refuses a caller without edit rights on the target, and moves nothing', async () => {
    const { handler, moveRow } = makeHandler({ allowed: false });

    expect((await handler.execute(command())).error).toBe(
      ContainerDomainError.INSUFFICIENT_PERMISSIONS,
    );
    expect(moveRow).not.toHaveBeenCalled();
  });

  it('treats a version of another container as missing', async () => {
    const { handler } = makeHandler({ version: makeVersion(VERSION_ID, 'other') });
    expect((await handler.execute(command())).error).toBe(ContainerDomainError.VERSION_NOT_FOUND);
  });

  it('refuses a source version that is not a draft', async () => {
    const published = makeVersion(VERSION_ID, SOURCE_ID);
    published.publish('u');
    const { handler } = makeHandler({ version: published });
    expect((await handler.execute(command())).error).toBe(
      ContainerDomainError.CANNOT_MODIFY_NON_DRAFT_VERSION,
    );
  });

  it('refuses a row of another version', async () => {
    const { handler } = makeHandler({ row: makeRow(ContainerItemType.EXERCISE, 'other') });
    expect((await handler.execute(command())).error).toBe(ContainerDomainError.ITEM_NOT_FOUND);
  });

  it('does not move a module row out of its course', async () => {
    const { handler, moveRow } = makeHandler({ row: makeRow(ContainerItemType.CONTAINER) });
    expect((await handler.execute(command())).error).toBe(
      ContainerDomainError.ITEM_TYPE_NOT_MOVABLE,
    );
    expect(moveRow).not.toHaveBeenCalled();
  });

  it('sends a move within one container to the section move instead', async () => {
    const { handler } = makeHandler();
    expect((await handler.execute(command(SOURCE_ID))).error).toBe(
      ContainerDomainError.MOVE_TARGET_IS_SOURCE,
    );
  });

  it('reports a target that is gone or has no draft', async () => {
    const deleted = makeModule();
    deleted.softDelete();
    expect((await makeHandler({ target: deleted }).handler.execute(command())).error).toBe(
      ContainerDomainError.CONTAINER_NOT_FOUND,
    );
    expect((await makeHandler({ targetDraft: null }).handler.execute(command())).error).toBe(
      ContainerDomainError.VERSION_NOT_FOUND,
    );
  });

  it("refuses a section that is not the target draft's", async () => {
    const elsewhere = ContainerSectionEntity.create(
      { containerVersionId: 'version-17c-published', title: 'Øvelser', position: 1 },
      'section-17c',
    );
    const { handler, moveRow } = makeHandler({ section: elsewhere });

    expect((await handler.execute(command())).error).toBe(
      ContainerDomainError.SECTION_BELONGS_TO_DIFFERENT_VERSION,
    );
    expect(moveRow).not.toHaveBeenCalled();
  });

  it('reports a row that went away before the transaction', async () => {
    const { handler } = makeHandler({ moved: null });
    expect((await handler.execute(command())).error).toBe(ContainerDomainError.ITEM_NOT_FOUND);
  });
});
