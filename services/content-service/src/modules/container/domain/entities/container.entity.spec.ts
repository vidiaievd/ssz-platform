import { ContainerEntity } from './container.entity.js';
import { ContainerType } from '../value-objects/container-type.vo.js';
import { DifficultyLevel } from '../value-objects/difficulty-level.vo.js';
import { Visibility } from '../value-objects/visibility.vo.js';
import { AccessTier } from '../value-objects/access-tier.vo.js';
import { LevelSystem } from '../value-objects/level-system.vo.js';
import { GatingMode } from '../value-objects/gating-mode.vo.js';

function createCourse(levelSystem?: LevelSystem) {
  const result = ContainerEntity.create({
    containerType: ContainerType.COURSE,
    targetLanguage: 'no',
    difficultyLevel: DifficultyLevel.A1,
    title: 'Norwegian for Beginners',
    ownerUserId: 'owner-1',
    visibility: Visibility.PRIVATE,
    accessTier: AccessTier.ASSIGNED_ONLY,
    levelSystem,
  });
  if (result.isFail) throw new Error('failed to build fixture container');
  return result.value;
}

describe('ContainerEntity — levelSystem', () => {
  it('defaults to CEFR when not provided at creation', () => {
    const container = createCourse();

    expect(container.levelSystem).toBe(LevelSystem.CEFR);
  });

  it('accepts an explicit levelSystem at creation', () => {
    const container = createCourse(LevelSystem.SINGLE);

    expect(container.levelSystem).toBe(LevelSystem.SINGLE);
  });

  it('updates levelSystem and raises a ContainerUpdatedEvent', () => {
    const container = createCourse();
    container.clearDomainEvents();

    const result = container.update({ levelSystem: LevelSystem.CUSTOM });

    expect(result.isOk).toBe(true);
    expect(container.levelSystem).toBe(LevelSystem.CUSTOM);
    expect(container.getDomainEvents()).toHaveLength(1);
  });

  it('is a no-op when updated to the same levelSystem', () => {
    const container = createCourse(LevelSystem.CUSTOM);
    container.clearDomainEvents();

    const result = container.update({ levelSystem: LevelSystem.CUSTOM });

    expect(result.isOk).toBe(true);
    expect(container.getDomainEvents()).toHaveLength(0);
  });
});

describe('ContainerEntity — gatingMode', () => {
  it('defaults to OPEN at creation', () => {
    const container = createCourse();

    expect(container.gatingMode).toBe(GatingMode.OPEN);
  });

  it('updates gatingMode and raises a ContainerUpdatedEvent', () => {
    const container = createCourse();
    container.clearDomainEvents();

    const result = container.update({ gatingMode: GatingMode.SEQUENTIAL });

    expect(result.isOk).toBe(true);
    expect(container.gatingMode).toBe(GatingMode.SEQUENTIAL);
    expect(container.getDomainEvents()).toHaveLength(1);
  });

  it('is a no-op when updated to the same gatingMode', () => {
    const container = createCourse();
    container.clearDomainEvents();

    const result = container.update({ gatingMode: GatingMode.OPEN });

    expect(result.isOk).toBe(true);
    expect(container.getDomainEvents()).toHaveLength(0);
  });
});

describe('ContainerEntity — archive/restore', () => {
  it('archives a container, setting archivedAt and raising CourseArchivedEvent', () => {
    const container = createCourse();
    container.clearDomainEvents();

    const result = container.archive();

    expect(result.isOk).toBe(true);
    expect(container.archivedAt).not.toBeNull();
    // Archiving must not soft-delete: `VisibilityGuard` denies `edit` on a
    // deleted entity to everyone but a platform admin, and `POST /:id/restore`
    // — the way back from the archive — is an `edit` route.
    expect(container.deletedAt).toBeNull();
    expect(container.getDomainEvents()).toHaveLength(1);
    expect(container.getDomainEvents()[0].eventType).toBe('content.course.archived');
  });

  it('fails to archive an already-archived container', () => {
    const container = createCourse();
    container.archive();

    const result = container.archive();

    expect(result.isFail).toBe(true);
  });

  it('fails to archive a deleted container', () => {
    const container = createCourse();
    container.softDelete();

    const result = container.archive();

    expect(result.isFail).toBe(true);
  });

  it('restores an archived container, clearing archivedAt and raising CourseRestoredEvent', () => {
    const container = createCourse();
    container.archive();
    container.clearDomainEvents();

    const result = container.restore();

    expect(result.isOk).toBe(true);
    expect(container.archivedAt).toBeNull();
    expect(container.getDomainEvents()).toHaveLength(1);
    expect(container.getDomainEvents()[0].eventType).toBe('content.course.restored');
  });

  it('fails to restore a container that is not archived', () => {
    const container = createCourse();

    const result = container.restore();

    expect(result.isFail).toBe(true);
  });
});
