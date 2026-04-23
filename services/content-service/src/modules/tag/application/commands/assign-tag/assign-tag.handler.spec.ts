import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AssignTagHandler } from './assign-tag.handler.js';
import { AssignTagCommand } from './assign-tag.command.js';
import { TagEntity } from '../../../domain/entities/tag.entity.js';
import { TagScope } from '../../../domain/value-objects/tag-scope.vo.js';
import { TagCategory } from '../../../domain/value-objects/tag-category.vo.js';
import { Visibility } from '../../../../../modules/container/domain/value-objects/visibility.vo.js';
import { AccessTier } from '../../../../../modules/container/domain/value-objects/access-tier.vo.js';
import { TaggableEntityType } from '../../../../../shared/access-control/domain/types/taggable-entity-type.js';
import { VisibilityCheckerService } from '../../../../../shared/access-control/domain/services/visibility-checker.service.js';
import { EntityResolverRegistry } from '../../../../../shared/access-control/infrastructure/registry/entity-resolver-registry.js';
import { AccessDeniedException } from '../../../../../shared/access-control/presentation/exceptions/access-denied.exception.js';
import type { ITagRepository } from '../../../domain/repositories/tag.repository.interface.js';
import type { ITagAssignmentRepository } from '../../../domain/repositories/tag-assignment.repository.interface.js';
import type { AccessibleEntity } from '../../../../../shared/access-control/domain/types/accessible-entity.js';

const OWNER_ID = 'owner-1';
const ENTITY_ID = 'entity-1';
const TAG_ID = 'tag-1';
const SCHOOL_ID = 'school-1';

function makeTag(
  overrides: Partial<{
    scope: TagScope;
    ownerSchoolId: string | null;
    deletedAt: Date | null;
  }> = {},
): TagEntity {
  const result = TagEntity.create(
    {
      slug: 'test-tag',
      name: 'Test Tag',
      category: TagCategory.TOPIC,
      scope: overrides.scope ?? TagScope.GLOBAL,
      ownerSchoolId: overrides.ownerSchoolId ?? undefined,
      createdByUserId: OWNER_ID,
    },
    TAG_ID,
  );
  const tag = result.value;
  if (overrides.deletedAt) {
    (tag as any).props.deletedAt = overrides.deletedAt;
  }
  return tag;
}

function makeAccessibleEntity(overrides: Partial<AccessibleEntity> = {}): AccessibleEntity {
  return {
    id: ENTITY_ID,
    entityType: TaggableEntityType.CONTAINER,
    ownerUserId: OWNER_ID,
    ownerSchoolId: null,
    visibility: Visibility.PUBLIC,
    deletedAt: null,
    accessTier: AccessTier.PUBLIC_FREE,
    ...overrides,
  };
}

function makeHandler(
  options: {
    tag?: TagEntity | null;
    entity?: AccessibleEntity | null;
    canAccess?: boolean;
    ownerSchoolId?: string | null;
  } = {},
) {
  const { tag = makeTag(), entity = makeAccessibleEntity(), canAccess = true } = options;

  const tagRepo: ITagRepository = {
    findById: jest.fn().mockResolvedValue(tag),
    findBySlugAndScope: jest.fn(),
    countBySlugPrefix: jest.fn(),
    findAll: jest.fn(),
    save: jest.fn(),
  } as unknown as ITagRepository;

  const assignmentRepo: ITagAssignmentRepository = {
    findByEntity: jest.fn(),
    findByTagAndEntity: jest.fn(),
    save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
    delete: jest.fn(),
  };

  const registry = new EntityResolverRegistry();
  registry.register(TaggableEntityType.CONTAINER, jest.fn().mockResolvedValue(entity));

  const checker = {
    canAccess: jest
      .fn()
      .mockResolvedValue({ allowed: canAccess, reason: canAccess ? 'owner' : 'private' }),
  } as unknown as VisibilityCheckerService;

  return new AssignTagHandler(tagRepo, assignmentRepo, checker, registry);
}

describe('AssignTagHandler', () => {
  it('assigns a global tag to an entity when caller has edit access', async () => {
    const handler = makeHandler();
    const command = new AssignTagCommand(
      TAG_ID,
      TaggableEntityType.CONTAINER,
      ENTITY_ID,
      OWNER_ID,
      false,
    );
    const assignment = await handler.execute(command);
    expect(assignment.tagId).toBe(TAG_ID);
    expect(assignment.entityId).toBe(ENTITY_ID);
  });

  it('throws NotFoundException when tag does not exist', async () => {
    const handler = makeHandler({ tag: null });
    const command = new AssignTagCommand(
      TAG_ID,
      TaggableEntityType.CONTAINER,
      ENTITY_ID,
      OWNER_ID,
      false,
    );
    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when tag is soft-deleted', async () => {
    const handler = makeHandler({ tag: makeTag({ deletedAt: new Date() }) });
    const command = new AssignTagCommand(
      TAG_ID,
      TaggableEntityType.CONTAINER,
      ENTITY_ID,
      OWNER_ID,
      false,
    );
    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when target entity does not exist', async () => {
    const handler = makeHandler({ entity: null });
    const command = new AssignTagCommand(
      TAG_ID,
      TaggableEntityType.CONTAINER,
      ENTITY_ID,
      OWNER_ID,
      false,
    );
    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
  });

  it('throws AccessDeniedException when caller lacks edit access', async () => {
    const handler = makeHandler({ canAccess: false });
    const command = new AssignTagCommand(
      TAG_ID,
      TaggableEntityType.CONTAINER,
      ENTITY_ID,
      'other-user',
      false,
    );
    await expect(handler.execute(command)).rejects.toThrow(AccessDeniedException);
  });

  it('throws UnprocessableEntityException when school-scoped tag targets entity from different school', async () => {
    const tag = makeTag({ scope: TagScope.SCHOOL, ownerSchoolId: SCHOOL_ID });
    const entity = makeAccessibleEntity({ ownerSchoolId: 'different-school' });
    const handler = makeHandler({ tag, entity });
    const command = new AssignTagCommand(
      TAG_ID,
      TaggableEntityType.CONTAINER,
      ENTITY_ID,
      OWNER_ID,
      false,
    );
    await expect(handler.execute(command)).rejects.toThrow(UnprocessableEntityException);
  });

  it('allows school-scoped tag assignment when entity belongs to the same school', async () => {
    const tag = makeTag({ scope: TagScope.SCHOOL, ownerSchoolId: SCHOOL_ID });
    const entity = makeAccessibleEntity({ ownerSchoolId: SCHOOL_ID });
    const handler = makeHandler({ tag, entity });
    const command = new AssignTagCommand(
      TAG_ID,
      TaggableEntityType.CONTAINER,
      ENTITY_ID,
      OWNER_ID,
      false,
    );
    const assignment = await handler.execute(command);
    expect(assignment.entityId).toBe(ENTITY_ID);
  });
});
