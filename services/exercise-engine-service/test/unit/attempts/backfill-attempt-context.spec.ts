import { contextPatch } from '../../../scripts/backfill-attempt-context.js';

const PLACEMENT = {
  containerId: 'course-1',
  containerTitle: 'Ny i Norge — A2',
  moduleId: 'module-1',
  moduleTitle: 'Leksjon 19',
  exerciseTitle: 'Leserinnlegg',
  ownerSchoolId: 'school-1',
};

const blank = {
  schoolId: null,
  containerId: null,
  groupId: null,
  exercisePath: null,
};

describe('the attempt-context backfill', () => {
  it('fills everything a blank row is missing', () => {
    expect(contextPatch(blank, PLACEMENT, 'group-1')).toEqual({
      schoolId: 'school-1',
      containerId: 'course-1',
      groupId: 'group-1',
      exercisePath: {
        course: 'Ny i Norge — A2',
        module: 'Leksjon 19',
        exercise: 'Leserinnlegg',
      },
    });
  });

  /**
   * The rule that makes a second run free and a first run safe: a value snapshotted when
   * the learner started says where they were then, and a backfill months later does not
   * get to rewrite it with where they are now.
   */
  it('never overwrites what the row already carries', () => {
    const filled = {
      schoolId: 'school-old',
      containerId: 'course-old',
      groupId: 'group-old',
      exercisePath: { course: 'As it read then', module: null, exercise: 'Old title' },
    };

    expect(contextPatch(filled, PLACEMENT, 'group-1')).toEqual({});
  });

  it('fills the blanks beside the values it leaves alone', () => {
    const partial = { ...blank, groupId: 'group-old' };

    const patch = contextPatch(partial, PLACEMENT, 'group-1');

    expect(patch.groupId).toBeUndefined();
    expect(patch.schoolId).toBe('school-1');
  });

  /** A personal course has no school: the path is still worth having for the journal. */
  it('records the path of an exercise that belongs to no school', () => {
    const patch = contextPatch(blank, { ...PLACEMENT, ownerSchoolId: null }, null);

    expect(patch.schoolId).toBeUndefined();
    expect(patch.containerId).toBe('course-1');
    expect(patch.exercisePath).toMatchObject({ exercise: 'Leserinnlegg' });
  });

  /** A learner in no group leaves the row unassigned — which oversight has a place for. */
  it('leaves the group empty when the school knows of none', () => {
    expect(contextPatch(blank, PLACEMENT, null).groupId).toBeUndefined();
  });

  it('does nothing at all when content-service could not place the exercise', () => {
    expect(contextPatch(blank, null, 'group-1')).toEqual({});
  });
});
