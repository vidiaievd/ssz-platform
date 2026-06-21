import { ContainerSectionEntity } from './container-section.entity.js';

describe('ContainerSectionEntity', () => {
  describe('create', () => {
    it('assigns a random id when none is provided', () => {
      const section = ContainerSectionEntity.create({
        containerVersionId: 'version-1',
        title: 'A1 — Beginner',
        position: 0,
      });

      expect(section.id).toBeTruthy();
      expect(section.containerVersionId).toBe('version-1');
      expect(section.title).toBe('A1 — Beginner');
      expect(section.position).toBe(0);
    });

    it('uses the provided id when given', () => {
      const section = ContainerSectionEntity.create(
        { containerVersionId: 'version-1', title: 'Module 1', position: 2 },
        'fixed-id',
      );

      expect(section.id).toBe('fixed-id');
    });

    it('stamps createdAt at creation time', () => {
      const before = new Date();
      const section = ContainerSectionEntity.create({
        containerVersionId: 'version-1',
        title: 'Module 1',
        position: 0,
      });
      const after = new Date();

      expect(section.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(section.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('reconstitute', () => {
    it('restores an entity from persisted props without generating new values', () => {
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      const section = ContainerSectionEntity.reconstitute('section-1', {
        containerVersionId: 'version-1',
        title: 'B1 — Intermediate',
        position: 3,
        createdAt,
      });

      expect(section.id).toBe('section-1');
      expect(section.containerVersionId).toBe('version-1');
      expect(section.title).toBe('B1 — Intermediate');
      expect(section.position).toBe(3);
      expect(section.createdAt).toBe(createdAt);
    });
  });

  describe('rename', () => {
    it('updates the title', () => {
      const section = ContainerSectionEntity.create({
        containerVersionId: 'version-1',
        title: 'Module 1',
        position: 0,
      });

      section.rename('Module 1 — Revised');

      expect(section.title).toBe('Module 1 — Revised');
    });
  });

  describe('reposition', () => {
    it('updates the position', () => {
      const section = ContainerSectionEntity.create({
        containerVersionId: 'version-1',
        title: 'Module 1',
        position: 0,
      });

      section.reposition(5);

      expect(section.position).toBe(5);
    });
  });
});
