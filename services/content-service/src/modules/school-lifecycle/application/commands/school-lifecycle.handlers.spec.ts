/* eslint-disable @typescript-eslint/require-await -- in-memory fakes of async ports */
import {
  MaintenanceSource,
  MaintenanceStatus,
} from '../../../container/domain/value-objects/maintenance-status.vo.js';
import type { SchoolMaterial, SchoolMaterialsGraph } from '../../domain/school-materials.js';
import { materialKey } from '../../domain/school-materials.js';
import type {
  ActiveLearnersQuestion,
  IActiveLearnersReader,
} from '../ports/active-learners.reader.port.js';
import type {
  DeletedMaterials,
  ISchoolMaterialsStore,
  SchoolCourse,
} from '../ports/school-materials.store.port.js';
import { PurgeSchoolMaterialsHandler } from './purge-school-materials.handler.js';
import {
  ApplySchoolClosedCommand,
  ApplySchoolRestoredCommand,
  PurgeSchoolMaterialsCommand,
} from './school-lifecycle.commands.js';
import {
  ApplySchoolClosedHandler,
  ApplySchoolRestoredHandler,
} from './school-maintenance.handlers.js';

const SCHOOL = 'school-1';
const { MAINTAINED, UNMAINTAINED, OBSOLETE } = MaintenanceStatus;
const { AUTHOR, SCHOOL: BY_SCHOOL } = MaintenanceSource;

/** An in-memory content database for one school, plus rows of another owner. */
class FakeStore implements ISchoolMaterialsStore {
  courses = new Map<string, SchoolCourse>();
  names = new Map<string, string | null>();
  materials: SchoolMaterial[] = [];
  foreign: SchoolMaterial[] = [];
  edges: SchoolMaterialsGraph['edges'] = [];
  holds: SchoolMaterialsGraph['holds'] = [];
  deletedKeys: string[] = [];
  workspaceRowsDeleted = 0;

  addCourse(id: string, status = MAINTAINED, source: MaintenanceSource | null = null) {
    this.courses.set(id, { id, status, source });
    this.names.set(id, null);
    this.materials.push({ kind: 'container', id, containerType: 'course' });
  }

  async findCourses(): Promise<SchoolCourse[]> {
    return [...this.courses.values()].map((c) => ({ ...c }));
  }
  async setMaintenance(
    ids: readonly string[],
    change: { status: MaintenanceStatus; source: MaintenanceSource },
  ) {
    for (const id of ids) this.courses.set(id, { id, ...change });
  }
  async snapshotSchoolName(_schoolId: string, name: string, onlyMissing: boolean) {
    for (const id of this.names.keys())
      if (!onlyMissing || this.names.get(id) === null) this.names.set(id, name);
  }
  async loadGraph(): Promise<SchoolMaterialsGraph> {
    return { materials: [...this.materials], edges: [...this.edges], holds: [...this.holds] };
  }
  async deleteMaterials(
    schoolId: string,
    materials: readonly SchoolMaterial[],
  ): Promise<DeletedMaterials> {
    expect(schoolId).toBe(SCHOOL);
    const gone = new Set(materials.map(materialKey));
    this.deletedKeys.push(...gone);
    this.materials = this.materials.filter((m) => !gone.has(materialKey(m)));
    for (const m of materials) if (m.kind === 'container') this.courses.delete(m.id);
    return {
      containers: materials.filter((m) => m.kind === 'container').length,
      lessons: 0,
      exercises: 0,
      vocabularyLists: 0,
      grammarRules: 0,
      tags: 0,
      canDo: 0,
    };
  }
  async deleteWorkspaceRows() {
    this.workspaceRowsDeleted += 1;
  }
}

class FakeLearners implements IActiveLearnersReader {
  active = new Set<string>();
  asked: ActiveLearnersQuestion[][] = [];
  fail = false;
  async countActive(questions: readonly ActiveLearnersQuestion[]) {
    if (this.fail) throw new Error('learning-service refused active-learners: HTTP 503');
    this.asked.push([...questions]);
    return new Map([...this.active].map((k) => [k, 1]));
  }
}

function purgeHandler(store: FakeStore, learners: FakeLearners) {
  return new PurgeSchoolMaterialsHandler(store, learners, { activeDays: 90 });
}

describe('school.closed / school.restored', () => {
  it('closing makes maintained courses unmaintained and keeps the school name', async () => {
    const store = new FakeStore();
    store.addCourse('c1');
    store.addCourse('c2', UNMAINTAINED, AUTHOR);
    store.addCourse('c3', OBSOLETE, AUTHOR);

    const changed = await new ApplySchoolClosedHandler(store).execute(
      new ApplySchoolClosedCommand(SCHOOL, 'Nordisk'),
    );

    expect(changed).toBe(1);
    expect(store.courses.get('c1')).toMatchObject({ status: UNMAINTAINED, source: BY_SCHOOL });
    expect(store.courses.get('c2')).toMatchObject({ status: UNMAINTAINED, source: AUTHOR });
    expect(store.courses.get('c3')).toMatchObject({ status: OBSOLETE, source: AUTHOR });
    expect([...store.names.values()]).toEqual(['Nordisk', 'Nordisk', 'Nordisk']);
  });

  it("restoring brings back only the school's own changes", async () => {
    const store = new FakeStore();
    store.addCourse('c1');
    store.addCourse('c2', UNMAINTAINED, AUTHOR);
    await new ApplySchoolClosedHandler(store).execute(
      new ApplySchoolClosedCommand(SCHOOL, 'Nordisk'),
    );
    // The author takes the status over while the school is closed.
    store.addCourse('c3', UNMAINTAINED, AUTHOR);

    const changed = await new ApplySchoolRestoredHandler(store).execute(
      new ApplySchoolRestoredCommand(SCHOOL),
    );

    expect(changed).toBe(1);
    expect(store.courses.get('c1')).toMatchObject({ status: MAINTAINED, source: BY_SCHOOL });
    expect(store.courses.get('c2')).toMatchObject({ status: UNMAINTAINED, source: AUTHOR });
    expect(store.courses.get('c3')).toMatchObject({ status: UNMAINTAINED, source: AUTHOR });
  });

  it('closing twice changes nothing the second time', async () => {
    const store = new FakeStore();
    store.addCourse('c1');
    const handler = new ApplySchoolClosedHandler(store);
    await handler.execute(new ApplySchoolClosedCommand(SCHOOL, 'Nordisk'));
    expect(await handler.execute(new ApplySchoolClosedCommand(SCHOOL, 'Nordisk'))).toBe(0);
  });
});

describe('school.purged', () => {
  /** kept: course K (active learner) with lesson KL; shared lesson S; deleted: course D with lesson DL. */
  function school() {
    const store = new FakeStore();
    store.addCourse('K', UNMAINTAINED, BY_SCHOOL);
    store.addCourse('D', UNMAINTAINED, BY_SCHOOL);
    store.materials.push(
      { kind: 'lesson', id: 'KL' },
      { kind: 'lesson', id: 'DL' },
      { kind: 'lesson', id: 'S' },
    );
    store.edges.push(
      { from: { kind: 'container', id: 'K' }, to: { kind: 'lesson', id: 'KL' } },
      { from: { kind: 'container', id: 'D' }, to: { kind: 'lesson', id: 'DL' } },
      { from: { kind: 'container', id: 'D' }, to: { kind: 'lesson', id: 'S' } },
    );
    store.holds.push({ to: { kind: 'lesson', id: 'S' }, reason: 'share' });
    const learners = new FakeLearners();
    learners.active.add('container:K');
    return { store, learners };
  }

  it('keeps what is used, makes kept courses obsolete and deletes the rest', async () => {
    const { store, learners } = school();

    const result = await purgeHandler(store, learners).execute(
      new PurgeSchoolMaterialsCommand(SCHOOL, 'Nordisk'),
    );

    expect(store.deletedKeys.sort()).toEqual(['container:D', 'lesson:DL']);
    expect(store.materials.map(materialKey).sort()).toEqual([
      'container:K',
      'lesson:KL',
      'lesson:S',
    ]);
    expect(store.courses.get('K')).toMatchObject({ status: OBSOLETE, source: BY_SCHOOL });
    expect(store.names.get('K')).toBe('Nordisk');
    expect(store.workspaceRowsDeleted).toBe(1);
    expect(result).toMatchObject({ kept: 3, obsoleteCourses: 1 });
  });

  it('asks learning about containers with their leaves and about every studied material', async () => {
    const { store, learners } = school();
    await purgeHandler(store, learners).execute(new PurgeSchoolMaterialsCommand(SCHOOL, 'Nordisk'));
    const asked = learners.asked[0];
    expect(asked.find((q) => q.id === 'D')?.leafIds.sort()).toEqual(['DL', 'S']);
    expect(asked.find((q) => q.id === 'S')).toEqual({ kind: 'lesson', id: 'S', leafIds: [] });
  });

  it('deletes nothing when learning cannot answer', async () => {
    const { store, learners } = school();
    learners.fail = true;

    await expect(
      purgeHandler(store, learners).execute(new PurgeSchoolMaterialsCommand(SCHOOL, 'Nordisk')),
    ).rejects.toThrow(/503/);

    expect(store.deletedKeys).toEqual([]);
    expect(store.courses.get('K')).toMatchObject({ status: UNMAINTAINED });
  });

  it('is safe to run again: nothing new is deleted, nothing rewritten', async () => {
    const { store, learners } = school();
    const handler = purgeHandler(store, learners);
    await handler.execute(new PurgeSchoolMaterialsCommand(SCHOOL, 'Nordisk'));
    store.deletedKeys = [];

    const again = await handler.execute(new PurgeSchoolMaterialsCommand(SCHOOL, 'Nordisk'));

    expect(store.deletedKeys).toEqual([]);
    expect(again.obsoleteCourses).toBe(0);
    expect(store.materials.map(materialKey).sort()).toEqual([
      'container:K',
      'lesson:KL',
      'lesson:S',
    ]);
  });

  it('a learner gone quiet keeps nothing', async () => {
    const { store, learners } = school();
    learners.active.clear();
    store.holds = [];
    await purgeHandler(store, learners).execute(new PurgeSchoolMaterialsCommand(SCHOOL, 'Nordisk'));
    expect(store.materials).toEqual([]);
  });
});
