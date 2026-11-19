/* eslint-disable @typescript-eslint/require-await -- in-memory fakes of async ports */
import {
  MaintenanceSource,
  MaintenanceStatus,
} from '../../../container/domain/value-objects/maintenance-status.vo.js';
import type {
  MaterialOwner,
  SchoolMaterial,
  SchoolMaterialsGraph,
} from '../../domain/school-materials.js';
import { materialKey, ownerKey } from '../../domain/school-materials.js';
import type {
  ActiveLearnersQuestion,
  IActiveLearnersReader,
} from '../ports/active-learners.reader.port.js';
import type { IContentCleanupLock } from '../ports/cleanup-lock.port.js';
import type {
  DeletedMaterials,
  ISchoolMaterialsStore,
  ObsoleteCourse,
  SchoolCourse,
} from '../ports/school-materials.store.port.js';
import type { ISchoolPurgeLedger, PendingSchoolPurge } from '../ports/school-purge.ledger.port.js';
import { CleanupObsoleteCoursesHandler } from './cleanup-obsolete-courses.handler.js';
import { PurgeSchoolMaterialsHandler } from './purge-school-materials.handler.js';
import { RunContentCleanupHandler } from './run-content-cleanup.handler.js';
import {
  ApplySchoolClosedCommand,
  ApplySchoolRestoredCommand,
  CleanupObsoleteCoursesCommand,
  PurgeSchoolMaterialsCommand,
  type SchoolPurgeSettings,
} from './school-lifecycle.commands.js';
import {
  ApplySchoolClosedHandler,
  ApplySchoolRestoredHandler,
} from './school-maintenance.handlers.js';

const SCHOOL = 'school-1';
const SCHOOL_OWNER: MaterialOwner = { kind: 'school', schoolId: SCHOOL };
const SETTINGS: SchoolPurgeSettings = {
  activeDays: 90,
  obsoleteGraceHours: 24,
  purgeRetryAfterMs: 30 * 60_000,
};
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
  deletedBy: string[] = [];
  workspaceRowsDeleted = 0;
  obsolete: ObsoleteCourse[] = [];
  obsoleteAskedBefore: Date[] = [];
  graphsLoaded: string[] = [];
  failGraphFor = new Set<string>();

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
  async findObsoleteCourses(changedBefore: Date): Promise<ObsoleteCourse[]> {
    this.obsoleteAskedBefore.push(changedBefore);
    return this.obsolete.filter((c) => this.courses.has(c.id) || this.isMaterial(c.id));
  }
  private isMaterial(id: string) {
    return this.materials.some((m) => m.kind === 'container' && m.id === id);
  }
  async loadGraph(owner: MaterialOwner): Promise<SchoolMaterialsGraph> {
    this.graphsLoaded.push(ownerKey(owner));
    if (this.failGraphFor.has(ownerKey(owner))) throw new Error('database is down');
    return { materials: [...this.materials], edges: [...this.edges], holds: [...this.holds] };
  }
  deleteOptions: Array<{ schoolPurged?: boolean } | undefined> = [];
  async deleteMaterials(
    owner: MaterialOwner,
    materials: readonly SchoolMaterial[],
    options?: { schoolPurged?: boolean },
  ): Promise<DeletedMaterials> {
    this.deletedBy.push(ownerKey(owner));
    this.deleteOptions.push(options);
    const gone = new Set(materials.map(materialKey));
    this.deletedKeys.push(...gone);
    this.materials = this.materials.filter((m) => !gone.has(materialKey(m)));
    for (const m of materials) if (m.kind === 'container') this.courses.delete(m.id);
    return {
      containers: materials.filter((m) => m.kind === 'container').length,
      lessons: materials.filter((m) => m.kind === 'lesson').length,
      exercises: 0,
      vocabularyLists: 0,
      grammarRules: 0,
      tags: 0,
      canDo: 0,
    };
  }
  retired: { schoolId: string; exerciseIds: string[]; listIds: string[]; afterDeletes: number }[] =
    [];
  failAnnounce = false;
  async announceStudyRetired(
    schoolId: string,
    exerciseIds: readonly string[],
    listIds: readonly string[],
  ) {
    if (this.failAnnounce) throw new Error('outbox is down');
    this.retired.push({
      schoolId,
      exerciseIds: [...exerciseIds],
      listIds: [...listIds],
      afterDeletes: this.deletedKeys.length,
    });
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

class FakeLedger implements ISchoolPurgeLedger {
  rows = new Map<
    string,
    PendingSchoolPurge & { lastAttemptAt: Date; error: string | null; done: boolean }
  >();
  async started(schoolId: string, schoolName: string, at: Date) {
    const row = this.rows.get(schoolId);
    if (row) Object.assign(row, { attempts: row.attempts + 1, lastAttemptAt: at });
    else
      this.rows.set(schoolId, {
        schoolId,
        schoolName,
        attempts: 1,
        lastAttemptAt: at,
        error: null,
        done: false,
      });
  }
  async completed(schoolId: string) {
    Object.assign(this.rows.get(schoolId)!, { done: true, error: null });
  }
  async failed(schoolId: string, error: string) {
    this.rows.get(schoolId)!.error = error;
  }
  async findStalled(attemptedBefore: Date, limit: number) {
    return [...this.rows.values()]
      .filter((r) => !r.done && r.lastAttemptAt < attemptedBefore)
      .slice(0, limit)
      .map(({ schoolId, schoolName, attempts }) => ({ schoolId, schoolName, attempts }));
  }
  async findPurged(schoolIds: readonly string[]) {
    return new Set(schoolIds.filter((id) => this.rows.has(id)));
  }
}

function purgeHandler(store: FakeStore, ledger = new FakeLedger()) {
  return new PurgeSchoolMaterialsHandler(store, ledger);
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
  /**
   * kept: course K (a foreign course's item points at it) with lesson KL; shared lesson S;
   * deleted: course D with lesson DL.
   */
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
    store.holds.push(
      { to: { kind: 'lesson', id: 'S' }, reason: 'share' },
      { to: { kind: 'container', id: 'K' }, reason: 'foreign_reference' },
    );
    return { store };
  }

  it('keeps what is used, makes kept courses obsolete and deletes the rest', async () => {
    const { store } = school();

    const result = await purgeHandler(store).execute(
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
    expect(store.deleteOptions).toEqual([{ schoolPurged: true }]);
    expect(result).toMatchObject({ kept: 3, obsoleteCourses: 1 });
  });

  it("a learner holds nothing (Q11): only shares and others' rows keep a course", async () => {
    // Course D has had learners right up to the purge; the result is the same whether learning
    // has already closed their enrolments or not, because nobody asks it.
    const { store } = school();
    await purgeHandler(store).execute(new PurgeSchoolMaterialsCommand(SCHOOL, 'Nordisk'));
    expect(store.deletedKeys).toContain('container:D');
    expect(store.courses.has('D')).toBe(false);
  });

  it('announces every exercise of the school and the deleted lists before deleting (Q11)', async () => {
    const { store } = school();
    store.materials.push(
      { kind: 'exercise', id: 'KE' },
      { kind: 'exercise', id: 'DE' },
      { kind: 'vocabulary_list', id: 'KV' },
      { kind: 'vocabulary_list', id: 'DV' },
    );
    store.edges.push(
      { from: { kind: 'lesson', id: 'KL' }, to: { kind: 'exercise', id: 'KE' } },
      { from: { kind: 'lesson', id: 'KL' }, to: { kind: 'vocabulary_list', id: 'KV' } },
      { from: { kind: 'lesson', id: 'DL' }, to: { kind: 'exercise', id: 'DE' } },
      { from: { kind: 'lesson', id: 'DL' }, to: { kind: 'vocabulary_list', id: 'DV' } },
    );

    await purgeHandler(store).execute(new PurgeSchoolMaterialsCommand(SCHOOL, 'Nordisk'));

    expect(store.retired).toHaveLength(1);
    expect(store.retired[0].schoolId).toBe(SCHOOL);
    // The kept exercise too: an obsolete course of a purged school is read only.
    expect(store.retired[0].exerciseIds.sort()).toEqual(['DE', 'KE']);
    expect(store.retired[0].listIds).toEqual(['DV']);
    expect(store.retired[0].afterDeletes).toBe(0);
    expect(store.deletedKeys).toContain('exercise:DE');
  });

  it('deletes nothing when the announcement fails', async () => {
    const { store } = school();
    store.failAnnounce = true;
    await expect(
      purgeHandler(store).execute(new PurgeSchoolMaterialsCommand(SCHOOL, 'Nordisk')),
    ).rejects.toThrow(/outbox is down/);
    expect(store.deletedKeys).toEqual([]);
  });

  it('deletes nothing when the materials cannot be read', async () => {
    const { store } = school();
    store.failGraphFor.add(ownerKey(SCHOOL_OWNER));

    await expect(
      purgeHandler(store).execute(new PurgeSchoolMaterialsCommand(SCHOOL, 'Nordisk')),
    ).rejects.toThrow(/database is down/);

    expect(store.deletedKeys).toEqual([]);
    expect(store.courses.get('K')).toMatchObject({ status: UNMAINTAINED });
  });

  it('is safe to run again: nothing new is deleted, nothing rewritten', async () => {
    const { store } = school();
    const handler = purgeHandler(store);
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

  it('nothing held → everything goes', async () => {
    const { store } = school();
    store.holds = [];
    await purgeHandler(store).execute(new PurgeSchoolMaterialsCommand(SCHOOL, 'Nordisk'));
    expect(store.materials).toEqual([]);
  });
});

describe('school.purged — the purge ledger (step 4c)', () => {
  it('records the attempt and its completion', async () => {
    const store = new FakeStore();
    store.addCourse('D');
    const ledger = new FakeLedger();

    await purgeHandler(store, ledger).execute(new PurgeSchoolMaterialsCommand(SCHOOL, 'Nordisk'));

    expect(ledger.rows.get(SCHOOL)).toMatchObject({
      schoolName: 'Nordisk',
      attempts: 1,
      done: true,
      error: null,
    });
    expect(store.deletedBy).toEqual([ownerKey(SCHOOL_OWNER)]);
  });

  it('keeps a failed purge unfinished with its error', async () => {
    const store = new FakeStore();
    store.addCourse('D');
    store.failGraphFor.add(ownerKey(SCHOOL_OWNER));
    const ledger = new FakeLedger();

    await expect(
      purgeHandler(store, ledger).execute(new PurgeSchoolMaterialsCommand(SCHOOL, 'Nordisk')),
    ).rejects.toThrow(/database is down/);

    expect(ledger.rows.get(SCHOOL)).toMatchObject({
      done: false,
      error: expect.stringMatching(/database is down/),
    });
  });
});

describe('obsolete cleanup (step 4c)', () => {
  const AUTHOR_ID = 'author-1';
  const AUTHOR_OWNER: MaterialOwner = { kind: 'user', userId: AUTHOR_ID };

  /**
   * Author's courses: O (obsolete) → OL (only O) and SL (also in the live course M); M (maintained)
   * → SL. Q (obsolete, a quiet learner long ago) → QL.
   */
  function author() {
    const store = new FakeStore();
    store.addCourse('O', OBSOLETE, AUTHOR);
    store.addCourse('M');
    store.materials.push(
      { kind: 'lesson', id: 'OL' },
      { kind: 'lesson', id: 'SL' },
      { kind: 'lesson', id: 'LOOSE' },
    );
    store.edges.push(
      { from: { kind: 'container', id: 'O' }, to: { kind: 'lesson', id: 'OL' } },
      { from: { kind: 'container', id: 'O' }, to: { kind: 'lesson', id: 'SL' } },
      { from: { kind: 'container', id: 'M' }, to: { kind: 'lesson', id: 'SL' } },
    );
    store.obsolete.push({ id: 'O', owner: AUTHOR_OWNER });
    return { store, learners: new FakeLearners() };
  }

  const cleanup = (store: FakeStore, learners: FakeLearners, ledger = new FakeLedger()) =>
    new CleanupObsoleteCoursesHandler(store, learners, ledger, SETTINGS).execute();

  it('deletes the course and what only it used; the owner keeps the rest', async () => {
    const { store, learners } = author();

    const result = await cleanup(store, learners);

    expect(store.deletedKeys.sort()).toEqual(['container:O', 'lesson:OL']);
    expect(store.deletedBy).toEqual([ownerKey(AUTHOR_OWNER)]);
    expect(store.deleteOptions).toEqual([{ schoolPurged: false }]);
    expect(store.materials.map(materialKey).sort()).toEqual([
      'container:M',
      'lesson:LOOSE',
      'lesson:SL',
    ]);
    expect(result).toEqual({ courses: 1, deletedCourses: 1, deletedOther: 1, failedOwners: 0 });
  });

  it('asks learning only about the candidates', async () => {
    const { store, learners } = author();
    await cleanup(store, learners);
    expect(learners.asked[0].map((q) => q.id).sort()).toEqual(['O', 'OL', 'SL']);
    expect(learners.asked[0].find((q) => q.id === 'O')?.leafIds.sort()).toEqual(['OL', 'SL']);
  });

  it('an active learner of the course keeps it and everything in it', async () => {
    const { store, learners } = author();
    learners.active.add('container:O');
    const result = await cleanup(store, learners);
    expect(store.deletedKeys).toEqual([]);
    expect(store.deletedBy).toEqual([]);
    expect(result.deletedCourses).toBe(0);
  });

  it('a share on a lesson keeps the lesson, not the course', async () => {
    const { store, learners } = author();
    store.holds.push({ to: { kind: 'lesson', id: 'OL' }, reason: 'share' });
    await cleanup(store, learners);
    expect(store.deletedKeys).toEqual(['container:O']);
  });

  it('looks only past the grace period', async () => {
    const { store, learners } = author();
    const before = Date.now();
    await cleanup(store, learners);
    const asked = store.obsoleteAskedBefore[0].getTime();
    expect(before - asked).toBeGreaterThanOrEqual(24 * 3600_000 - 1000);
    expect(before - asked).toBeLessThanOrEqual(24 * 3600_000 + 1000);
  });

  it('deletes nothing of an owner when learning cannot answer, and goes on with the others', async () => {
    const { store, learners } = author();
    store.obsolete.push({ id: 'S1', owner: SCHOOL_OWNER });
    store.addCourse('S1', OBSOLETE, BY_SCHOOL);
    store.failGraphFor.add(ownerKey(AUTHOR_OWNER));

    const result = await cleanup(store, learners);

    expect(store.graphsLoaded.sort()).toEqual(
      [ownerKey(SCHOOL_OWNER), ownerKey(AUTHOR_OWNER)].sort(),
    );
    expect(store.deletedBy).toEqual([ownerKey(SCHOOL_OWNER)]);
    expect(store.deletedKeys).toContain('container:S1');
    expect(store.deletedKeys).not.toContain('container:O');
    expect(result.failedOwners).toBe(1);
  });

  it("a purged school's course: learners hold nothing and learning is not asked (Q11)", async () => {
    const store = new FakeStore();
    store.addCourse('P', OBSOLETE, BY_SCHOOL);
    store.materials.push({ kind: 'lesson', id: 'PL' });
    store.edges.push({ from: { kind: 'container', id: 'P' }, to: { kind: 'lesson', id: 'PL' } });
    store.obsolete.push({ id: 'P', owner: SCHOOL_OWNER });
    const learners = new FakeLearners();
    learners.active.add('container:P');
    learners.fail = true;
    const ledger = new FakeLedger();
    await ledger.started(SCHOOL, 'Nordisk', new Date());
    await ledger.completed(SCHOOL);

    const result = await cleanup(store, learners, ledger);

    expect(store.deletedKeys.sort()).toEqual(['container:P', 'lesson:PL']);
    expect(store.deleteOptions).toEqual([{ schoolPurged: true }]);
    expect(learners.asked).toEqual([]);
    expect(result).toMatchObject({ deletedCourses: 1, failedOwners: 0 });
  });

  it("a purged school's course a share holds stays", async () => {
    const store = new FakeStore();
    store.addCourse('P', OBSOLETE, BY_SCHOOL);
    store.obsolete.push({ id: 'P', owner: SCHOOL_OWNER });
    store.holds.push({ to: { kind: 'container', id: 'P' }, reason: 'share' });
    const ledger = new FakeLedger();
    await ledger.started(SCHOOL, 'Nordisk', new Date());

    const result = await cleanup(store, new FakeLearners(), ledger);

    expect(store.deletedKeys).toEqual([]);
    expect(result.deletedCourses).toBe(0);
  });

  it('a course retired by its author in a school that is still there keeps its learners', async () => {
    const store = new FakeStore();
    store.addCourse('R', OBSOLETE, AUTHOR);
    store.obsolete.push({ id: 'R', owner: SCHOOL_OWNER });
    const learners = new FakeLearners();
    learners.active.add('container:R');

    await cleanup(store, learners);

    expect(learners.asked).toHaveLength(1);
    expect(store.deletedKeys).toEqual([]);
  });

  it('learning silent → nothing deleted', async () => {
    const { store, learners } = author();
    learners.fail = true;
    const result = await cleanup(store, learners);
    expect(store.deletedKeys).toEqual([]);
    expect(result.failedOwners).toBe(1);
  });
});

describe('the cleanup run (step 4c)', () => {
  class FakeLock implements IContentCleanupLock {
    free = true;
    async run(work: () => Promise<void>) {
      if (!this.free) return false;
      await work();
      return true;
    }
  }

  function run(ledger: FakeLedger, lock = new FakeLock(), failSchools = new Set<string>()) {
    const executed: unknown[] = [];
    const bus = {
      execute: jest.fn(async (command: unknown) => {
        executed.push(command);
        if (command instanceof PurgeSchoolMaterialsCommand && failSchools.has(command.schoolId))
          throw new Error('learning-service refused active-learners: HTTP 503');
      }),
    };
    const handler = new RunContentCleanupHandler(lock, ledger, SETTINGS, bus as never);
    return { executed, go: () => handler.execute() };
  }

  it('runs the stalled purges again, then the obsolete cleanup', async () => {
    const ledger = new FakeLedger();
    const long = new Date(Date.now() - 3600_000);
    await ledger.started('s-stalled', 'Stalled', long);
    await ledger.started('s-recent', 'Recent', new Date());
    await ledger.started('s-done', 'Done', long);
    await ledger.completed('s-done');
    const { executed, go } = run(ledger);

    const result = await go();

    expect(result).toEqual({ ran: true, purgesRetried: 1, purgesFailed: 0 });
    expect(executed).toEqual([
      new PurgeSchoolMaterialsCommand('s-stalled', 'Stalled'),
      new CleanupObsoleteCoursesCommand(),
    ]);
  });

  it('a purge failing again does not stop the cleanup', async () => {
    const ledger = new FakeLedger();
    await ledger.started('s-1', 'One', new Date(Date.now() - 3600_000));
    const { executed, go } = run(ledger, new FakeLock(), new Set(['s-1']));

    const result = await go();

    expect(result).toEqual({ ran: true, purgesRetried: 1, purgesFailed: 1 });
    expect(executed.at(-1)).toEqual(new CleanupObsoleteCoursesCommand());
  });

  it('does nothing while another instance holds the lock', async () => {
    const lock = new FakeLock();
    lock.free = false;
    const { executed, go } = run(new FakeLedger(), lock);
    expect(await go()).toEqual({ ran: false, purgesRetried: 0, purgesFailed: 0 });
    expect(executed).toEqual([]);
  });
});
