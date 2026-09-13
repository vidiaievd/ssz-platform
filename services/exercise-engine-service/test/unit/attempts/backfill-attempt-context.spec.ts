import { contextPatch } from '../../../scripts/backfill-attempt-context.js';

const PLACEMENT = {
  containerId: 'course-1',
  containerTitle: 'Ny i Norge — A2',
  moduleId: 'module-1',
  moduleTitle: 'Leksjon 19',
  exerciseTitle: 'Leserinnlegg',
  ownerSchoolId: 'school-1',
  ownerUserId: 'author-1',
};

const blank = {
  schoolId: null,
  containerId: null,
  groupId: null,
  exercisePath: null,
};

const learner = { schoolId: 'school-1', groupId: 'group-1' };
const nowhere = { schoolId: null, groupId: null };

describe('the attempt-context backfill', () => {
  it('fills everything a blank row is missing', () => {
    expect(contextPatch(blank, PLACEMENT, learner)).toEqual({
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

    expect(contextPatch(filled, PLACEMENT, learner)).toEqual({});
  });

  it('fills the blanks beside the values it leaves alone', () => {
    const partial = { ...blank, groupId: 'group-old' };

    const patch = contextPatch(partial, PLACEMENT, learner);

    expect(patch.groupId).toBeUndefined();
    expect(patch.schoolId).toBe('school-1');
  });

  /**
   * The work this reaches: a private tutor's course belongs to no school, so every
   * submission of theirs is waiting with no school at all (plan 59 §1.1 C).
   */
  it('takes the workspace from the learner when the course belongs to no school', () => {
    const patch = contextPatch(blank, { ...PLACEMENT, ownerSchoolId: null }, {
      schoolId: 'solo-workspace',
      groupId: 'tutor-group',
    });

    expect(patch.schoolId).toBe('solo-workspace');
    expect(patch.groupId).toBe('tutor-group');
    expect(patch.containerId).toBe('course-1');
  });

  /** The learner leads, and the content's owner is only the last resort. */
  it('prefers the learner workspace over the school owning the content', () => {
    const patch = contextPatch(blank, PLACEMENT, { schoolId: 'school-2', groupId: 'group-2' });

    expect(patch.schoolId).toBe('school-2');
  });

  it('falls back to the school owning the content when the learner belongs nowhere', () => {
    const patch = contextPatch(blank, PLACEMENT, nowhere);

    expect(patch.schoolId).toBe('school-1');
    expect(patch.groupId).toBeUndefined();
  });

  /** A personal course and a learner on no roster: the path is still worth having. */
  it('records the path of an exercise nobody can place in a school', () => {
    const patch = contextPatch(blank, { ...PLACEMENT, ownerSchoolId: null }, nowhere);

    expect(patch.schoolId).toBeUndefined();
    expect(patch.containerId).toBe('course-1');
    expect(patch.exercisePath).toMatchObject({ exercise: 'Leserinnlegg' });
  });

  /**
   * A missing placement used to mean nothing was written at all. The workspace does not
   * come from the content, so it is still worth writing — a row with a school is a row
   * a queue can show.
   */
  it('still places the learner when content-service could not place the exercise', () => {
    expect(contextPatch(blank, null, learner)).toEqual({
      schoolId: 'school-1',
      groupId: 'group-1',
    });
  });

  it('writes nothing when neither neighbour knows anything', () => {
    expect(contextPatch(blank, null, nowhere)).toEqual({});
  });
});
