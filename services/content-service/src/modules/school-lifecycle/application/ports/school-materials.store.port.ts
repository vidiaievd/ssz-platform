import type {
  MaintenanceChange,
  CourseMaintenance,
} from '../../domain/school-course-maintenance.js';
import type {
  MaterialOwner,
  SchoolMaterial,
  SchoolMaterialsGraph,
} from '../../domain/school-materials.js';

export const SCHOOL_MATERIALS_STORE = Symbol('SCHOOL_MATERIALS_STORE');

export interface SchoolCourse extends CourseMaintenance {
  id: string;
}

/** An `obsolete` course and whose it is (step 4c). */
export interface ObsoleteCourse {
  id: string;
  owner: MaterialOwner;
}

export interface DeletedMaterials {
  containers: number;
  lessons: number;
  exercises: number;
  vocabularyLists: number;
  grammarRules: number;
  tags: number;
  canDo: number;
}

/** content's side of a school's lifecycle (plan 90, phase 5, steps 4b–4c). */
export interface ISchoolMaterialsStore {
  /** The school's courses (`owner_school_id`), soft-deleted ones too. */
  findCourses(schoolId: string): Promise<SchoolCourse[]>;

  /** Writes one change to the given courses; `maintenance_changed_at` = `at`. */
  setMaintenance(
    courseIds: readonly string[],
    change: NonNullable<MaintenanceChange>,
    at: Date,
  ): Promise<void>;

  /**
   * The byline outlives the school: `owner_school_name` on every container of the school.
   * `onlyMissing` keeps a name already written (the purge fills in what a missed `closed` left).
   */
  snapshotSchoolName(schoolId: string, name: string, onlyMissing: boolean): Promise<void>;

  /** Everything the owner owns, what links it, and every hold but active learners'. */
  loadGraph(owner: MaterialOwner, now: Date): Promise<SchoolMaterialsGraph>;

  /**
   * `obsolete` courses of any owner and source whose status was set before `changedBefore`,
   * soft-deleted ones too (step 4c).
   */
  findObsoleteCourses(changedBefore: Date): Promise<ObsoleteCourse[]>;

  /**
   * Deletes the given materials of the owner and every row that only describes them (versions,
   * variants, tags on them, shares, entitlements, relations, audit rows) in small transactions,
   * so a crash leaves a smaller remainder for the redelivery. Never touches a row of another owner.
   * Announces each deleted container (`content.container.deleted`) before it goes.
   */
  deleteMaterials(
    owner: MaterialOwner,
    materials: readonly SchoolMaterial[],
  ): Promise<DeletedMaterials>;

  /** Rows keyed by the school alone (its coverage recipe). */
  deleteWorkspaceRows(schoolId: string): Promise<void>;
}
