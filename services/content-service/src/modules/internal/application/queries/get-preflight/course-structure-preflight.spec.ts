import { courseStructureViolations } from './course-structure-preflight.js';

// Learners reach a course through its modules only (OQ-6): material on the course itself
// is not shown on the phone, so a course carrying it is not published.

describe('courseStructureViolations', () => {
  const items = [
    { itemType: 'CONTAINER', itemId: 'module-1' },
    { itemType: 'LESSON', itemId: 'lesson-1' },
    { itemType: 'EXERCISE', itemId: 'exercise-1' },
    { itemType: 'VOCABULARY_LIST', itemId: 'list-1' },
    { itemType: 'GRAMMAR_RULE', itemId: 'rule-1' },
  ];

  it('blocks every material placed on a course outside a module', () => {
    const violations = courseStructureViolations('COURSE', items);

    expect(violations.map((v) => [v.itemType, v.itemId])).toEqual([
      ['LESSON', 'lesson-1'],
      ['EXERCISE', 'exercise-1'],
      ['VOCABULARY_LIST', 'list-1'],
      ['GRAMMAR_RULE', 'rule-1'],
    ]);
    expect(new Set(violations.map((v) => v.ruleCode))).toEqual(new Set(['ITEM_OUTSIDE_MODULE']));
    expect(violations.every((v) => v.severity === 'blocker')).toBe(true);
  });

  it('lets a course built only from modules through', () => {
    expect(courseStructureViolations('COURSE', [items[0]])).toEqual([]);
  });

  it('does not check a module or a collection, which hold material directly', () => {
    expect(courseStructureViolations('MODULE', items)).toEqual([]);
    expect(courseStructureViolations('COLLECTION', items)).toEqual([]);
  });
});
