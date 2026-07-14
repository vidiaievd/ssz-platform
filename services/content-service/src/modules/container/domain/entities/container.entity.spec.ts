import { ContainerEntity } from './container.entity.js';
import { ContainerType } from '../value-objects/container-type.vo.js';
import { DifficultyLevel } from '../value-objects/difficulty-level.vo.js';
import { Visibility } from '../value-objects/visibility.vo.js';
import { AccessTier } from '../value-objects/access-tier.vo.js';
import { LevelSystem } from '../value-objects/level-system.vo.js';

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
