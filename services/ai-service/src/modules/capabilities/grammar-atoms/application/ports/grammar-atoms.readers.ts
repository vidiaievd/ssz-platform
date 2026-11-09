export const LEARNER_GRAMMAR_ATOMS_READER = Symbol('ILearnerGrammarAtomsReader');
export const COURSE_ATOM_CATALOG_READER = Symbol('ICourseAtomCatalogReader');

/** `in_queue` — the learner has a card for it; `covered` — reached in the course, no card. */
export type LearnerAtomStatus = 'in_queue' | 'covered';

/** learning-service: the grammar atoms a learner has reached (plan 85, step 1). Throws when unreadable. */
export interface ILearnerGrammarAtomsReader {
  atoms(userId: string, courseId: string): Promise<Array<{ atomId: string; status: LearnerAtomStatus }>>;
}

/** One atom of a course, as content-service names it for a prompt (plan 85, step 2). */
export interface CourseAtom {
  atomId: string;
  ruleId: string;
  ruleTitle: string;
  title: string;
  description: string | null;
}

/** content-service: every grammar atom of a course. Empty for an unknown course; throws when unreadable. */
export interface ICourseAtomCatalogReader {
  catalog(courseId: string, language: string): Promise<CourseAtom[]>;
}
