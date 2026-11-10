import {
  cleanupCandidates,
  leafIdsOf,
  planObsoleteCleanup,
  planSchoolPurge,
  type MaterialHold,
  type SchoolMaterialsGraph,
} from './school-materials.js';

const course = (id: string) => ({ kind: 'container' as const, id, containerType: 'course' });
const module_ = (id: string) => ({ kind: 'container' as const, id, containerType: 'module' });
const lesson = (id: string) => ({ kind: 'lesson' as const, id });
const exercise = (id: string) => ({ kind: 'exercise' as const, id });
const list = (id: string) => ({ kind: 'vocabulary_list' as const, id });
const rule = (id: string) => ({ kind: 'grammar_rule' as const, id });
const tag = (id: string) => ({ kind: 'tag' as const, id });
const learner = (to: MaterialHold['to']): MaterialHold => ({ to, reason: 'active_learner' });

/** C1 (held by a learner) → M1 → L1 → E1, L1 → V1; C2 → L2 → E2; R1 pool → E3; T1 on C1, T2 on C2. */
function graph(holds: MaterialHold[] = []): SchoolMaterialsGraph {
  return {
    materials: [
      course('C1'),
      module_('M1'),
      lesson('L1'),
      exercise('E1'),
      list('V1'),
      course('C2'),
      lesson('L2'),
      exercise('E2'),
      rule('R1'),
      exercise('E3'),
      tag('T1'),
      tag('T2'),
    ],
    edges: [
      { from: course('C1'), to: module_('M1') },
      { from: module_('M1'), to: lesson('L1') },
      { from: lesson('L1'), to: exercise('E1') },
      { from: lesson('L1'), to: list('V1') },
      { from: course('C2'), to: lesson('L2') },
      { from: lesson('L2'), to: exercise('E2') },
      { from: rule('R1'), to: exercise('E3') },
      { from: course('C1'), to: tag('T1') },
      { from: course('C2'), to: tag('T2') },
      // A school course naming somebody else's lesson: an edge out of the school, never deleted.
      { from: course('C2'), to: lesson('FOREIGN') },
    ],
    holds,
  };
}

const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort();

describe('planSchoolPurge', () => {
  it('deletes everything when nobody uses anything', () => {
    const plan = planSchoolPurge(graph(), []);
    expect(plan.kept).toEqual([]);
    expect(ids(plan.deleted)).toEqual([
      'C1',
      'C2',
      'E1',
      'E2',
      'E3',
      'L1',
      'L2',
      'M1',
      'R1',
      'T1',
      'T2',
      'V1',
    ]);
  });

  it('keeps a course with an active learner and everything it reaches', () => {
    const plan = planSchoolPurge(graph(), [learner(course('C1'))]);
    expect(ids(plan.kept)).toEqual(['C1', 'E1', 'L1', 'M1', 'T1', 'V1']);
    expect(plan.keptCourseIds).toEqual(['C1']);
    expect(ids(plan.deleted)).toEqual(['C2', 'E2', 'E3', 'L2', 'R1', 'T2']);
  });

  it('keeps what a share or a foreign row holds, without the course around it', () => {
    const plan = planSchoolPurge(
      graph([
        { to: lesson('L2'), reason: 'share' },
        { to: exercise('E3'), reason: 'foreign_reference' },
      ]),
      [],
    );
    expect(ids(plan.kept)).toEqual(['E2', 'E3', 'L2']);
    expect(plan.keptCourseIds).toEqual([]);
  });

  it("keeps a rule's pool with the rule", () => {
    expect(ids(planSchoolPurge(graph([{ to: rule('R1'), reason: 'share' }]), []).kept)).toEqual([
      'E3',
      'R1',
    ]);
  });

  it('never plans anything outside the school', () => {
    const plan = planSchoolPurge(graph([{ to: lesson('FOREIGN'), reason: 'share' }]), [
      learner(course('C2')),
    ]);
    const all = [...plan.kept, ...plan.deleted].map((m) => m.id);
    expect(all).not.toContain('FOREIGN');
    expect(ids(plan.kept)).toEqual(['C2', 'E2', 'L2', 'T2']);
  });

  it('keeps a module only when something holds it, not because a deleted course named it', () => {
    const plan = planSchoolPurge(graph([{ to: module_('M1'), reason: 'foreign_reference' }]), []);
    expect(ids(plan.kept)).toEqual(['E1', 'L1', 'M1', 'V1']);
    expect(ids(plan.deleted)).toContain('C1');
    expect(plan.keptCourseIds).toEqual([]);
  });

  it('survives cycles', () => {
    const g = graph();
    g.edges.push({ from: lesson('L1'), to: course('C1') });
    expect(ids(planSchoolPurge(g, [learner(lesson('L1'))]).kept)).toEqual([
      'C1',
      'E1',
      'L1',
      'M1',
      'T1',
      'V1',
    ]);
  });
});

describe('leafIdsOf', () => {
  it("collects studied materials through the school's nested containers, foreign ones included", () => {
    expect(leafIdsOf('C1', graph()).sort()).toEqual(['L1']);
    expect(leafIdsOf('C2', graph()).sort()).toEqual(['FOREIGN', 'L2']);
  });

  it('does not count tags as leaves', () => {
    expect(leafIdsOf('C2', graph())).not.toContain('T2');
  });
});

describe('planObsoleteCleanup', () => {
  /** Owner: obsolete O → OL, O → SL; live course K → SL; module MO only in O → ML. */
  function owner(holds: MaterialHold[] = []): SchoolMaterialsGraph {
    return {
      materials: [
        course('O'),
        lesson('OL'),
        lesson('SL'),
        course('K'),
        module_('MO'),
        lesson('ML'),
        lesson('LOOSE'),
      ],
      edges: [
        { from: course('O'), to: lesson('OL') },
        { from: course('O'), to: lesson('SL') },
        { from: course('O'), to: module_('MO') },
        { from: module_('MO'), to: lesson('ML') },
        { from: course('K'), to: lesson('SL') },
      ],
      holds,
    };
  }
  const keys = (ms: { kind: string; id: string }[]) => ms.map((m) => `${m.kind}:${m.id}`).sort();

  it("candidates are the courses and what they reach; the owner's other materials are not", () => {
    expect(keys(cleanupCandidates(owner(), ['O']))).toEqual([
      'container:MO',
      'container:O',
      'lesson:ML',
      'lesson:OL',
      'lesson:SL',
    ]);
  });

  it("the owner's live course holds what it shares with the obsolete one", () => {
    const plan = planObsoleteCleanup(owner(), ['O'], []);
    expect(keys(plan.deleted)).toEqual(['container:MO', 'container:O', 'lesson:ML', 'lesson:OL']);
    expect(keys(plan.kept)).toEqual(['lesson:SL']);
    expect(plan.keptCourseIds).toEqual([]);
  });

  it('an active learner keeps the course whole', () => {
    const plan = planObsoleteCleanup(owner(), ['O'], [learner(course('O'))]);
    expect(plan.deleted).toEqual([]);
    expect(plan.keptCourseIds).toEqual(['O']);
  });

  it('a foreign hold inside keeps only that part', () => {
    const plan = planObsoleteCleanup(
      owner([{ to: module_('MO'), reason: 'foreign_reference' }]),
      ['O'],
      [],
    );
    expect(keys(plan.kept)).toEqual(['container:MO', 'lesson:ML', 'lesson:SL']);
    expect(keys(plan.deleted)).toEqual(['container:O', 'lesson:OL']);
  });

  it('a course that is not in the graph (already gone) yields nothing', () => {
    expect(planObsoleteCleanup(owner(), ['GONE'], [])).toEqual({
      kept: [],
      keptCourseIds: [],
      deleted: [],
    });
  });

  it('two obsolete courses sharing a lesson delete it together', () => {
    const g = owner();
    const plan = planObsoleteCleanup(g, ['O', 'K'], []);
    expect(keys(plan.kept)).toEqual([]);
    expect(keys(plan.deleted)).not.toContain('lesson:LOOSE');
    expect(keys(plan.deleted)).toContain('lesson:SL');
  });
});
