import { ContainerItemEntity } from './container-item.entity.js';
import { ContainerItemType } from '../value-objects/item-type.vo.js';

function makeItem(): ContainerItemEntity {
  return ContainerItemEntity.create({
    containerVersionId: 'version-1',
    position: 0,
    itemType: ContainerItemType.LESSON,
    itemId: 'lesson-1',
  });
}

describe('ContainerItemEntity', () => {
  it('defaults xpReward to null on create', () => {
    const item = makeItem();
    expect(item.xpReward).toBeNull();
  });

  it('sets xpReward on create when provided', () => {
    const item = ContainerItemEntity.create({
      containerVersionId: 'version-1',
      position: 0,
      itemType: ContainerItemType.LESSON,
      itemId: 'lesson-1',
      xpReward: 10,
    });
    expect(item.xpReward).toBe(10);
  });

  it('sets xpReward via update', () => {
    const item = makeItem();
    item.update({ xpReward: 15 });
    expect(item.xpReward).toBe(15);
  });

  it('preserves xpReward when a partial update omits it', () => {
    const item = makeItem();
    item.update({ xpReward: 15 });

    item.update({ isRequired: false });

    expect(item.xpReward).toBe(15);
    expect(item.isRequired).toBe(false);
  });

  it('clears xpReward when update passes null explicitly', () => {
    const item = makeItem();
    item.update({ xpReward: 15 });

    item.update({ xpReward: null });

    expect(item.xpReward).toBeNull();
  });
});
