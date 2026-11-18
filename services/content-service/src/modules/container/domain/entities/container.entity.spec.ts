import { ContainerEntity } from './container.entity.js';
import { ContainerType } from '../value-objects/container-type.vo.js';
import { DifficultyLevel } from '../value-objects/difficulty-level.vo.js';
import { Visibility } from '../value-objects/visibility.vo.js';
import { AccessTier } from '../value-objects/access-tier.vo.js';
import { LevelSystem } from '../value-objects/level-system.vo.js';
import { GatingMode } from '../value-objects/gating-mode.vo.js';
import { MaintenanceSource, MaintenanceStatus } from '../value-objects/maintenance-status.vo.js';
import { ContainerDomainError } from '../exceptions/container-domain.exceptions.js';

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

describe('ContainerEntity — learningGoals', () => {
  it('starts with none', () => {
    expect(createCourse().learningGoals).toEqual([]);
  });

  it('keeps the goals in order, trimmed, without blank entries', () => {
    const container = createCourse();
    container.clearDomainEvents();

    const result = container.update({
      learningGoals: ['  Bestille mat ', '', '   ', 'Spørre om prisen'],
    });

    expect(result.isOk).toBe(true);
    expect(container.learningGoals).toEqual(['Bestille mat', 'Spørre om prisen']);
    expect(container.getDomainEvents()).toHaveLength(1);
  });

  it('clears them with an empty list', () => {
    const container = createCourse();
    container.update({ learningGoals: ['Bestille mat'] });
    container.clearDomainEvents();

    container.update({ learningGoals: [] });

    expect(container.learningGoals).toEqual([]);
    expect(container.getDomainEvents()).toHaveLength(1);
  });

  it('is a no-op when the list reads the same after trimming', () => {
    const container = createCourse();
    container.update({ learningGoals: ['Bestille mat'] });
    container.clearDomainEvents();

    container.update({ learningGoals: [' Bestille mat', ''] });

    expect(container.getDomainEvents()).toHaveLength(0);
  });

  it('does not hand out its own array', () => {
    const container = createCourse();
    container.update({ learningGoals: ['Bestille mat'] });

    container.learningGoals.push('Smuggled');

    expect(container.learningGoals).toEqual(['Bestille mat']);
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

describe('ContainerEntity — maintenance status (plan 90, Q5)', () => {
  it('starts maintained, never touched', () => {
    const container = createCourse();

    expect(container.maintenanceStatus).toBe(MaintenanceStatus.MAINTAINED);
    expect(container.maintenanceSource).toBeNull();
    expect(container.maintenanceChangedAt).toBeNull();
    expect(container.isObsolete).toBe(false);
  });

  it.each([
    [MaintenanceStatus.MAINTAINED, MaintenanceStatus.UNMAINTAINED],
    [MaintenanceStatus.MAINTAINED, MaintenanceStatus.OBSOLETE],
    [MaintenanceStatus.UNMAINTAINED, MaintenanceStatus.OBSOLETE],
    [MaintenanceStatus.UNMAINTAINED, MaintenanceStatus.MAINTAINED],
    [MaintenanceStatus.OBSOLETE, MaintenanceStatus.MAINTAINED],
    [MaintenanceStatus.OBSOLETE, MaintenanceStatus.UNMAINTAINED],
  ])('the author moves %s → %s', (from, to) => {
    const container = createCourse();
    if (from !== MaintenanceStatus.MAINTAINED) container.setMaintenanceByAuthor(from);
    container.clearDomainEvents();

    const result = container.setMaintenanceByAuthor(to);

    expect(result.isOk && result.value).toBe(true);
    expect(container.maintenanceStatus).toBe(to);
    expect(container.maintenanceSource).toBe(MaintenanceSource.AUTHOR);
    expect(container.maintenanceChangedAt).toBeInstanceOf(Date);
    expect(container.getDomainEvents()).toHaveLength(1);
    expect(container.getDomainEvents()[0].eventType).toBe('content.container.updated');
  });

  it('the same status again changes nothing', () => {
    const container = createCourse();
    container.setMaintenanceByAuthor(MaintenanceStatus.UNMAINTAINED);
    const changedAt = container.maintenanceChangedAt;
    container.clearDomainEvents();

    const result = container.setMaintenanceByAuthor(MaintenanceStatus.UNMAINTAINED);

    expect(result.isOk && result.value).toBe(false);
    expect(container.maintenanceChangedAt).toBe(changedAt);
    expect(container.getDomainEvents()).toHaveLength(0);
  });

  it('maintained on a never-touched course is a no-op', () => {
    const container = createCourse();
    container.clearDomainEvents();

    const result = container.setMaintenanceByAuthor(MaintenanceStatus.MAINTAINED);

    expect(result.isOk && result.value).toBe(false);
    expect(container.maintenanceSource).toBeNull();
    expect(container.getDomainEvents()).toHaveLength(0);
  });

  it('the author takes over a status the school set, so a restore will not undo it', () => {
    const container = ContainerEntity.reconstitute('c-1', {
      ...propsOf(createCourse()),
      maintenanceStatus: MaintenanceStatus.UNMAINTAINED,
      maintenanceSource: MaintenanceSource.SCHOOL,
      maintenanceChangedAt: new Date('2026-11-01T00:00:00Z'),
    });

    const result = container.setMaintenanceByAuthor(MaintenanceStatus.UNMAINTAINED);

    expect(result.isOk && result.value).toBe(true);
    expect(container.maintenanceStatus).toBe(MaintenanceStatus.UNMAINTAINED);
    expect(container.maintenanceSource).toBe(MaintenanceSource.AUTHOR);
  });

  it('is obsolete only at obsolete', () => {
    const container = createCourse();
    container.setMaintenanceByAuthor(MaintenanceStatus.UNMAINTAINED);
    expect(container.isObsolete).toBe(false);

    container.setMaintenanceByAuthor(MaintenanceStatus.OBSOLETE);
    expect(container.isObsolete).toBe(true);
  });

  it('refuses a module — the course carries the status', () => {
    const created = ContainerEntity.create({
      containerType: ContainerType.MODULE,
      targetLanguage: 'no',
      difficultyLevel: DifficultyLevel.A1,
      title: 'Leksjon 1',
      ownerUserId: 'owner-1',
      visibility: Visibility.PRIVATE,
      accessTier: AccessTier.ASSIGNED_ONLY,
    });
    if (created.isFail) throw new Error('fixture');

    const result = created.value.setMaintenanceByAuthor(MaintenanceStatus.OBSOLETE);

    expect(result.isFail && result.error).toBe(ContainerDomainError.MAINTENANCE_ONLY_FOR_COURSES);
    expect(created.value.maintenanceStatus).toBe(MaintenanceStatus.MAINTAINED);
  });

  it('refuses an unknown status', () => {
    const container = createCourse();

    const result = container.setMaintenanceByAuthor('retired' as MaintenanceStatus);

    expect(result.isFail && result.error).toBe(ContainerDomainError.INVALID_MAINTENANCE_STATUS);
  });

  it('refuses a deleted course', () => {
    const container = createCourse();
    container.softDelete();

    const result = container.setMaintenanceByAuthor(MaintenanceStatus.OBSOLETE);

    expect(result.isFail && result.error).toBe(ContainerDomainError.CONTAINER_ALREADY_DELETED);
  });
});

/** Every prop of an entity, for reconstituting a variant of it. */
function propsOf(c: ContainerEntity): Parameters<typeof ContainerEntity.reconstitute>[1] {
  return {
    slug: c.slug,
    containerType: c.containerType,
    targetLanguage: c.targetLanguage,
    difficultyLevel: c.difficultyLevel,
    title: c.title,
    description: c.description,
    coverImageMediaId: c.coverImageMediaId,
    ownerUserId: c.ownerUserId,
    ownerSchoolId: c.ownerSchoolId,
    visibility: c.visibility,
    accessTier: c.accessTier,
    levelSystem: c.levelSystem,
    gatingMode: c.gatingMode,
    reviewRespondWithinHours: c.reviewRespondWithinHours,
    reviewAutoAcceptAfterHours: c.reviewAutoAcceptAfterHours,
    reviewTeacherTemplates: c.reviewTeacherTemplates,
    coverageRecipe: c.coverageRecipe,
    learningGoals: c.learningGoals,
    currentPublishedVersionId: c.currentPublishedVersionId,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    deletedAt: c.deletedAt,
    archivedAt: c.archivedAt,
    maintenanceStatus: c.maintenanceStatus,
    maintenanceSource: c.maintenanceSource,
    maintenanceChangedAt: c.maintenanceChangedAt,
    ownerSchoolName: c.ownerSchoolName,
  };
}
