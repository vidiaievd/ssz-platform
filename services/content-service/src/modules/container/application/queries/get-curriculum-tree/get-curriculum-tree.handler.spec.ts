// Prevent Jest from loading the generated Prisma client (uses import.meta which
// breaks CommonJS transform). The handler under test receives PrismaService via
// constructor injection, so a bare class stub is enough.
jest.mock('../../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { GetCurriculumTreeHandler } from './get-curriculum-tree.handler.js';
import { GetCurriculumTreeQuery } from './get-curriculum-tree.query.js';
import { ContainerEntity } from '../../../domain/entities/container.entity.js';
import { ContainerVersionEntity } from '../../../domain/entities/container-version.entity.js';
import { ContainerSectionEntity } from '../../../domain/entities/container-section.entity.js';
import { ContainerItemEntity } from '../../../domain/entities/container-item.entity.js';
import { ContainerType } from '../../../domain/value-objects/container-type.vo.js';
import { DifficultyLevel } from '../../../domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../domain/value-objects/visibility.vo.js';
import { AccessTier } from '../../../domain/value-objects/access-tier.vo.js';
import { LevelSystem } from '../../../domain/value-objects/level-system.vo.js';
import { ContainerItemType } from '../../../domain/value-objects/item-type.vo.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerVersionRepository } from '../../../domain/repositories/container-version.repository.interface.js';
import type { IContainerSectionRepository } from '../../../domain/repositories/container-section.repository.interface.js';
import type { IContainerItemRepository } from '../../../domain/repositories/container-item.repository.interface.js';
import type {
  ContainerPublishState,
  PublishStateReader,
} from '../../services/publish-state.reader.js';

const COURSE_ID = 'course-1';
const COURSE_VERSION_ID = 'course-version-1';
const MODULE_ID = 'module-1';
const MODULE_VERSION_ID = 'module-version-1';
const LEVEL_SECTION_ID = 'level-a1';
const MODULE_ITEM_ID = 'module-item-1';
const LESSON_SECTION_ID = 'lesson-section-1';
const LESSON_ITEM_ID = 'lesson-item-1';
const LESSON_ID = 'lesson-1';

function makeCourse(): ContainerEntity {
  const result = ContainerEntity.create(
    {
      containerType: ContainerType.COURSE,
      targetLanguage: 'no',
      difficultyLevel: DifficultyLevel.A1,
      title: 'Norwegian for Beginners',
      ownerUserId: 'owner-1',
      visibility: Visibility.PRIVATE,
      accessTier: AccessTier.ASSIGNED_ONLY,
      levelSystem: LevelSystem.CEFR,
    },
    COURSE_ID,
  );
  if (result.isFail) throw new Error('failed to build fixture container');
  return result.value;
}

function makeCourseVersion(): ContainerVersionEntity {
  return ContainerVersionEntity.create(
    { containerId: COURSE_ID, versionNumber: 1, createdByUserId: 'owner-1' },
    COURSE_VERSION_ID,
  );
}

function makeModuleItem(sectionId: string | null): ContainerItemEntity {
  return ContainerItemEntity.create(
    {
      containerVersionId: COURSE_VERSION_ID,
      position: 0,
      itemType: ContainerItemType.CONTAINER,
      itemId: MODULE_ID,
      sectionId: sectionId ?? undefined,
    },
    MODULE_ITEM_ID,
  );
}

function makeLevelSection(): ContainerSectionEntity {
  return ContainerSectionEntity.create(
    { containerVersionId: COURSE_VERSION_ID, title: 'A1 — Beginner', position: 0 },
    LEVEL_SECTION_ID,
  );
}

function makeLessonSection(): ContainerSectionEntity {
  return ContainerSectionEntity.create(
    { containerVersionId: MODULE_VERSION_ID, title: 'Reinforce & read', position: 0 },
    LESSON_SECTION_ID,
  );
}

/** A lesson attached directly to the requested version, the way a module holds its own material. */
function makeOwnLessonItem(sectionId: string | null): ContainerItemEntity {
  return ContainerItemEntity.create(
    {
      containerVersionId: COURSE_VERSION_ID,
      position: 1,
      itemType: ContainerItemType.LESSON,
      itemId: LESSON_ID,
      sectionId: sectionId ?? undefined,
      xpReward: 5,
    },
    'own-item-1',
  );
}

function makeLessonItem(): ContainerItemEntity {
  return ContainerItemEntity.create(
    {
      containerVersionId: MODULE_VERSION_ID,
      position: 0,
      itemType: ContainerItemType.LESSON,
      itemId: LESSON_ID,
      sectionId: LESSON_SECTION_ID,
      xpReward: 10,
    },
    LESSON_ITEM_ID,
  );
}

interface Fixture {
  moduleItem?: ContainerItemEntity | null;
  levelSection?: ContainerSectionEntity | null;
  lessonSection?: ContainerSectionEntity | null;
  lessonItem?: ContainerItemEntity | null;
  lessonVariantStatus?: 'DRAFT' | 'PUBLISHED' | null;
  publishStates?: Record<string, ContainerPublishState>;
  /** A leaf item attached straight to the requested version — a module's own material. */
  ownItem?: ContainerItemEntity | null;
}

function makeHandler(fixture: Fixture = {}) {
  const moduleItem =
    fixture.moduleItem !== null ? (fixture.moduleItem ?? makeModuleItem(LEVEL_SECTION_ID)) : null;
  const levelSection =
    fixture.levelSection !== null ? (fixture.levelSection ?? makeLevelSection()) : null;
  const lessonSection =
    fixture.lessonSection !== null ? (fixture.lessonSection ?? makeLessonSection()) : null;
  const lessonItem = fixture.lessonItem !== null ? (fixture.lessonItem ?? makeLessonItem()) : null;

  const containerRepo: IContainerRepository = {
    findById: jest.fn().mockResolvedValue(makeCourse()),
  } as unknown as IContainerRepository;

  const versionRepo: IContainerVersionRepository = {
    findById: jest.fn().mockResolvedValue(makeCourseVersion()),
  } as unknown as IContainerVersionRepository;

  const sectionRepo: IContainerSectionRepository = {
    findByVersionId: jest.fn().mockImplementation((versionId: string) => {
      if (versionId === COURSE_VERSION_ID)
        return Promise.resolve(levelSection ? [levelSection] : []);
      if (versionId === MODULE_VERSION_ID)
        return Promise.resolve(lessonSection ? [lessonSection] : []);
      return Promise.resolve([]);
    }),
  } as unknown as IContainerSectionRepository;

  const itemRepo: IContainerItemRepository = {
    findByVersionId: jest.fn().mockImplementation((versionId: string) => {
      if (versionId === COURSE_VERSION_ID)
        return Promise.resolve(
          [moduleItem, fixture.ownItem ?? null].filter((i): i is ContainerItemEntity => i !== null),
        );
      if (versionId === MODULE_VERSION_ID) return Promise.resolve(lessonItem ? [lessonItem] : []);
      return Promise.resolve([]);
    }),
  } as unknown as IContainerItemRepository;

  const prisma = {
    container: {
      findMany: jest.fn().mockResolvedValue([{ id: MODULE_ID, title: 'Samfunn og kultur' }]),
    },
    containerLocalization: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ containerId: MODULE_ID, title: 'Society and culture' }]),
    },
    containerVersion: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: MODULE_VERSION_ID, containerId: MODULE_ID, status: 'DRAFT' }]),
    },
    lesson: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: LESSON_ID, title: 'En vanlig arbeidsdag', kind: 'TEXT' }]),
    },
    lessonContentVariant: {
      findMany: jest.fn().mockResolvedValue(
        fixture.lessonVariantStatus === null
          ? []
          : [
              {
                lessonId: LESSON_ID,
                status: fixture.lessonVariantStatus ?? 'PUBLISHED',
                estimatedReadingMinutes: 6,
              },
            ],
      ),
    },
    vocabularyList: { findMany: jest.fn().mockResolvedValue([]) },
    grammarRule: { findMany: jest.fn().mockResolvedValue([]) },
    grammarRuleExplanation: { findMany: jest.fn().mockResolvedValue([]) },
    exercise: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;

  const publishStateReader = {
    resolve: jest
      .fn()
      .mockResolvedValue(
        new Map(
          Object.entries(
            fixture.publishStates ?? { [COURSE_ID]: 'draft', [MODULE_ID]: 'draft' },
          ) as [string, ContainerPublishState][],
        ),
      ),
  } as unknown as PublishStateReader;

  return new GetCurriculumTreeHandler(
    containerRepo,
    versionRepo,
    sectionRepo,
    itemRepo,
    publishStateReader,
    prisma,
  );
}

describe('GetCurriculumTreeHandler', () => {
  it('fails when the version does not exist', async () => {
    const versionRepo: IContainerVersionRepository = {
      findById: jest.fn().mockResolvedValue(null),
    } as unknown as IContainerVersionRepository;
    const containerRepo: IContainerRepository = {
      findById: jest.fn(),
    } as unknown as IContainerRepository;
    const sectionRepo = {} as IContainerSectionRepository;
    const itemRepo = {} as IContainerItemRepository;
    const handler = new GetCurriculumTreeHandler(
      containerRepo,
      versionRepo,
      sectionRepo,
      itemRepo,
      {} as never,
      {} as never,
    );

    const result = await handler.execute(new GetCurriculumTreeQuery(COURSE_VERSION_ID));

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(ContainerDomainError.VERSION_NOT_FOUND);
  });

  it('builds a level → module → section → item tree', async () => {
    const handler = makeHandler();

    const result = await handler.execute(new GetCurriculumTreeQuery(COURSE_VERSION_ID));

    expect(result.isOk).toBe(true);
    if (result.isFail) return;

    expect(result.value.levelSystem).toBe(LevelSystem.CEFR);
    expect(result.value.levels).toHaveLength(1);

    const level = result.value.levels[0];
    expect(level.id).toBe(LEVEL_SECTION_ID);
    expect(level.modules).toHaveLength(1);

    const mod = level.modules[0];
    expect(mod.containerId).toBe(MODULE_ID);
    expect(mod.title).toBe('Samfunn og kultur');
    expect(mod.titleEn).toBe('Society and culture');
    expect(mod.versionId).toBe(MODULE_VERSION_ID);
    expect(mod.sections).toHaveLength(1);

    const section = mod.sections[0];
    expect(section.id).toBe(LESSON_SECTION_ID);
    expect(section.items).toHaveLength(1);

    const item = section.items[0];
    expect(item.refId).toBe(LESSON_ID);
    expect(item.title).toBe('En vanlig arbeidsdag');
    expect(item.lessonKind).toBe('text');
    expect(item.state).toBe('published');
    expect(item.durationMinutes).toBe(6);
    expect(item.xpReward).toBe(10);
  });

  it('carries the publish state of the course and of each module', async () => {
    const handler = makeHandler({
      publishStates: { [COURSE_ID]: 'published', [MODULE_ID]: 'pending_changes' },
    });

    const result = await handler.execute(new GetCurriculumTreeQuery(COURSE_VERSION_ID));

    expect(result.isOk).toBe(true);
    if (result.isFail) return;
    expect(result.value.publishState).toBe('published');
    expect(result.value.levels[0].modules[0].publishState).toBe('pending_changes');
  });

  it('falls back to draft for a container the publish state reader did not resolve', async () => {
    const handler = makeHandler({ publishStates: {} });

    const result = await handler.execute(new GetCurriculumTreeQuery(COURSE_VERSION_ID));

    expect(result.isOk).toBe(true);
    if (result.isFail) return;
    expect(result.value.publishState).toBe('draft');
    expect(result.value.levels[0].modules[0].publishState).toBe('draft');
  });

  it("surfaces the container's own items inside their section", async () => {
    const handler = makeHandler({
      moduleItem: null,
      ownItem: makeOwnLessonItem(LEVEL_SECTION_ID),
    });

    const result = await handler.execute(new GetCurriculumTreeQuery(COURSE_VERSION_ID));

    expect(result.isOk).toBe(true);
    if (result.isFail) return;
    const level = result.value.levels[0];
    expect(level.modules).toHaveLength(0);
    // Dropping these left a module's own editor showing empty sections.
    expect(level.items).toHaveLength(1);
    expect(level.items[0].refId).toBe(LESSON_ID);
    expect(level.items[0].title).toBe('En vanlig arbeidsdag');
  });

  it("reports the container's own sectionless items at the root", async () => {
    const handler = makeHandler({
      moduleItem: null,
      levelSection: null,
      ownItem: makeOwnLessonItem(null),
    });

    const result = await handler.execute(new GetCurriculumTreeQuery(COURSE_VERSION_ID));

    expect(result.isOk).toBe(true);
    if (result.isFail) return;
    expect(result.value.ungroupedItems.map((i) => i.refId)).toEqual([LESSON_ID]);
  });

  it('reports the container type so the UI can name the row correctly', async () => {
    const handler = makeHandler();

    const result = await handler.execute(new GetCurriculumTreeQuery(COURSE_VERSION_ID));

    expect(result.isOk).toBe(true);
    if (result.isFail) return;
    expect(result.value.containerType).toBe('course');
  });

  it('marks a lesson as draft when it has no published variant', async () => {
    const handler = makeHandler({ lessonVariantStatus: 'DRAFT' });

    const result = await handler.execute(new GetCurriculumTreeQuery(COURSE_VERSION_ID));

    expect(result.isOk).toBe(true);
    if (result.isFail) return;
    expect(result.value.levels[0].modules[0].sections[0].items[0].state).toBe('draft');
  });

  it('groups sectionless modules into a trailing ungrouped level', async () => {
    const handler = makeHandler({ moduleItem: makeModuleItem(null), levelSection: null });

    const result = await handler.execute(new GetCurriculumTreeQuery(COURSE_VERSION_ID));

    expect(result.isOk).toBe(true);
    if (result.isFail) return;
    expect(result.value.levels).toHaveLength(1);
    expect(result.value.levels[0].id).toBeNull();
    expect(result.value.levels[0].modules).toHaveLength(1);
  });
});
