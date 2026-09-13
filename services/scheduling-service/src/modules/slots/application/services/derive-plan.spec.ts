import { planUnitsFromOutline } from './derive-plan.js';
import type { CourseOutline } from '../ports/course-outline.reader.js';

const unit = (id: string, order: number, lessons: number, title: string | null = `Unit ${order}`) => ({
  id,
  title,
  order,
  items: [
    ...Array.from({ length: lessons }, (_, i) => ({ id: `${id}-l${i}`, itemType: 'lesson' })),
    { id: `${id}-v`, itemType: 'vocabulary_list' },
  ],
});

const outline = (units: CourseOutline['units']): CourseOutline => ({ versionId: 'v1', units });

describe('a plan derived from a course', () => {
  it('gives one unit per course unit, in the course order, stitched to it', () => {
    const units = planUnitsFromOutline(outline([unit('u1', 1, 2), unit('u2', 2, 3)]));

    expect(units.map((u) => [u.order, u.plannedSessions, u.contentUnitId])).toEqual([
      [1, 2, 'u1'],
      [2, 3, 'u2'],
    ]);
  });

  it('plans at least one session for a unit that holds no lesson of its own', () => {
    const units = planUnitsFromOutline(outline([unit('u1', 1, 0)]));

    expect(units[0]?.plannedSessions).toBe(1);
  });

  it('names an untitled unit by its position rather than leaving it blank', () => {
    const units = planUnitsFromOutline(outline([unit('u1', 1, 1, null)]));

    expect(units[0]?.title).toBe('Unit 1');
  });

  it('derives nothing from a course with nothing published', () => {
    expect(planUnitsFromOutline(outline([]))).toEqual([]);
  });
});
