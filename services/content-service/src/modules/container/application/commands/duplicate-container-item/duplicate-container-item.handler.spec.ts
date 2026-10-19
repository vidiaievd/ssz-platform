import { DuplicateContainerItemHandler } from './duplicate-container-item.handler.js';
import { DuplicateContainerItemCommand } from './duplicate-container-item.command.js';
import { ContainerEntity } from '../../../domain/entities/container.entity.js';
import { ContainerVersionEntity } from '../../../domain/entities/container-version.entity.js';
import { ContainerItemEntity } from '../../../domain/entities/container-item.entity.js';
import { ContainerType } from '../../../domain/value-objects/container-type.vo.js';
import { DifficultyLevel } from '../../../domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../domain/value-objects/visibility.vo.js';
import { AccessTier } from '../../../domain/value-objects/access-tier.vo.js';
import { ContainerItemType } from '../../../domain/value-objects/item-type.vo.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerVersionRepository } from '../../../domain/repositories/container-version.repository.interface.js';
import type { IContainerItemRepository } from '../../../domain/repositories/container-item.repository.interface.js';
import type {
  DuplicatedExercise,
  DuplicatedLesson,
  IContainerItemDuplicator,
} from '../../ports/container-item-duplicator.port.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.port.js';

const USER_ID = 'user-1';
const SCHOOL_ID = 'school-1';
const CONTAINER_ID = 'container-1';
const VERSION_ID = 'version-1';
const ROW_ID = 'row-1';

function makeContainer(): ContainerEntity {
  const result = ContainerEntity.create({
    containerType: ContainerType.MODULE,
    targetLanguage: 'nb',
    difficultyLevel: DifficultyLevel.A2,
    title: 'Leksjon 17',
    ownerUserId: 'someone-else',
    ownerSchoolId: SCHOOL_ID,
    visibility: Visibility.SCHOOL_PRIVATE,
    accessTier: AccessTier.ASSIGNED_ONLY,
  });
  if (result.isFail) throw new Error('failed to build fixture container');
  return result.value;
}

function makeVersion(containerId = CONTAINER_ID): ContainerVersionEntity {
  return ContainerVersionEntity.create(
    { containerId, versionNumber: 1, createdByUserId: USER_ID },
    VERSION_ID,
  );
}

function makeRow(itemType = ContainerItemType.EXERCISE, versionId = VERSION_ID) {
  return ContainerItemEntity.reconstitute(ROW_ID, {
    containerVersionId: versionId,
    position: 3,
    itemType,
    itemId: 'exercise-1',
    isRequired: true,
    sectionId: 'section-1',
    sectionLabel: null,
    xpReward: null,
    addedAt: new Date(),
  });
}

const COPY: DuplicatedExercise = {
  rowId: 'row-copy',
  position: 4,
  exerciseId: 'exercise-copy',
  templateCode: 'multiple_choice',
  targetLanguage: 'nb',
};

const LESSON_COPY: DuplicatedLesson = {
  rowId: 'row-copy',
  position: 4,
  lessonId: 'lesson-copy',
  targetLanguage: 'nb',
  variants: [
    { variantId: 'variant-copy', explanationLanguage: 'en', minLevel: 'A2', maxLevel: 'A2' },
  ],
  exercises: [{ exerciseId: 'stage-copy', templateCode: 'gap_fill', targetLanguage: 'nb' }],
};

function makeHandler(overrides?: {
  version?: ContainerVersionEntity | null;
  row?: ContainerItemEntity | null;
  copy?: DuplicatedExercise | null;
  lessonCopy?: DuplicatedLesson | null;
}) {
  const containerRepo = {
    findById: jest.fn().mockResolvedValue(makeContainer()),
  } as unknown as IContainerRepository;
  // The mocks the tests assert on are kept as plain functions: asserting on a method
  // read off the cast repository trips `unbound-method`.
  const saveVersion = jest.fn().mockResolvedValue(undefined);
  const duplicateExerciseRow = jest
    .fn()
    .mockResolvedValue(overrides && 'copy' in overrides ? overrides.copy : COPY);
  const duplicateLessonRow = jest
    .fn()
    .mockResolvedValue(overrides && 'lessonCopy' in overrides ? overrides.lessonCopy : LESSON_COPY);
  const publish = jest.fn().mockResolvedValue(undefined);
  const versionRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(overrides && 'version' in overrides ? overrides.version : makeVersion()),
    save: saveVersion,
  } as unknown as IContainerVersionRepository;
  const itemRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(overrides && 'row' in overrides ? overrides.row : makeRow()),
  } as unknown as IContainerItemRepository;
  const duplicator = {
    duplicateExerciseRow,
    duplicateLessonRow,
  } as unknown as IContainerItemDuplicator;
  const eventPublisher = { publish } as unknown as IEventPublisher;

  const handler = new DuplicateContainerItemHandler(
    containerRepo,
    versionRepo,
    itemRepo,
    duplicator,
    eventPublisher,
  );
  return { handler, saveVersion, duplicateExerciseRow, duplicateLessonRow, publish };
}

const command = new DuplicateContainerItemCommand(USER_ID, CONTAINER_ID, VERSION_ID, ROW_ID);

describe('DuplicateContainerItemHandler', () => {
  it('copies the exercise under the module owner pair and announces the copy', async () => {
    const { handler, saveVersion, duplicateExerciseRow, publish } = makeHandler();

    const result = await handler.execute(command);

    expect(result.isOk).toBe(true);
    expect(result.value).toEqual({ itemId: 'row-copy', position: 4, materialId: 'exercise-copy' });
    expect(duplicateExerciseRow).toHaveBeenCalledWith({
      versionId: VERSION_ID,
      rowId: ROW_ID,
      userId: USER_ID,
      ownerSchoolId: SCHOOL_ID,
      visibility: Visibility.SCHOOL_PRIVATE,
    });
    expect(saveVersion).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(
      'content.exercise.created',
      expect.objectContaining({
        payload: expect.objectContaining({ exerciseId: 'exercise-copy', ownerUserId: USER_ID }),
      }),
    );
  });

  it('treats a version of another container as missing', async () => {
    const { handler, duplicateExerciseRow } = makeHandler({
      version: makeVersion('other-container'),
    });

    const result = await handler.execute(command);

    expect(result.error).toBe(ContainerDomainError.VERSION_NOT_FOUND);
    expect(duplicateExerciseRow).not.toHaveBeenCalled();
  });

  it('refuses a version that is not a draft', async () => {
    const published = makeVersion();
    published.publish(USER_ID);
    const { handler } = makeHandler({ version: published });

    const result = await handler.execute(command);

    expect(result.error).toBe(ContainerDomainError.CANNOT_MODIFY_NON_DRAFT_VERSION);
  });

  it('refuses a row of another version', async () => {
    const { handler } = makeHandler({ row: makeRow(ContainerItemType.EXERCISE, 'other-version') });

    const result = await handler.execute(command);

    expect(result.error).toBe(ContainerDomainError.ITEM_NOT_FOUND);
  });

  it('copies a lesson and announces it, its variants and its stage exercises', async () => {
    const { handler, saveVersion, duplicateExerciseRow, duplicateLessonRow, publish } = makeHandler(
      { row: makeRow(ContainerItemType.LESSON) },
    );

    const result = await handler.execute(command);

    expect(result.value).toEqual({ itemId: 'row-copy', position: 4, materialId: 'lesson-copy' });
    expect(duplicateLessonRow).toHaveBeenCalledWith(
      expect.objectContaining({ rowId: ROW_ID, userId: USER_ID, ownerSchoolId: SCHOOL_ID }),
    );
    expect(duplicateExerciseRow).not.toHaveBeenCalled();
    expect(saveVersion).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls.map(([type]) => type)).toEqual([
      'content.lesson.created',
      'content.lesson.variant.created',
      'content.exercise.created',
    ]);
    expect(publish.mock.calls[0][1]).toMatchObject({
      payload: { lessonId: 'lesson-copy', ownerUserId: USER_ID, visibility: 'school_private' },
    });
    expect(publish.mock.calls[2][1]).toMatchObject({ payload: { exerciseId: 'stage-copy' } });
  });

  it('reports a lesson that vanished before the copy, and touches nothing', async () => {
    const { handler, saveVersion, publish } = makeHandler({
      row: makeRow(ContainerItemType.LESSON),
      lessonCopy: null,
    });

    const result = await handler.execute(command);

    expect(result.error).toBe(ContainerDomainError.ITEM_NOT_FOUND);
    expect(saveVersion).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('refuses rows placing a vocabulary list or a grammar rule', async () => {
    const { handler, duplicateExerciseRow } = makeHandler({
      row: makeRow(ContainerItemType.VOCABULARY_LIST),
    });

    const result = await handler.execute(command);

    expect(result.error).toBe(ContainerDomainError.ITEM_TYPE_NOT_DUPLICABLE);
    expect(duplicateExerciseRow).not.toHaveBeenCalled();

    const rule = makeHandler({ row: makeRow(ContainerItemType.GRAMMAR_RULE) });
    expect((await rule.handler.execute(command)).error).toBe(
      ContainerDomainError.ITEM_TYPE_NOT_DUPLICABLE,
    );
    expect(rule.duplicateLessonRow).not.toHaveBeenCalled();
  });

  it('reports a source that vanished before the copy, and touches nothing', async () => {
    const { handler, saveVersion, publish } = makeHandler({ copy: null });

    const result = await handler.execute(command);

    expect(result.error).toBe(ContainerDomainError.ITEM_NOT_FOUND);
    expect(saveVersion).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
