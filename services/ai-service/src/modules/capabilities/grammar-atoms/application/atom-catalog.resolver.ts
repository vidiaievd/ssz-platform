import { Inject, Injectable, Logger } from '@nestjs/common';
import { EMPTY_CATALOG, MAX_CATALOG_ATOMS, type AtomCatalog, type AtomCatalogEntry } from '../domain/atom-catalog.js';
import {
  COURSE_ATOM_CATALOG_READER,
  LEARNER_GRAMMAR_ATOMS_READER,
  type ICourseAtomCatalogReader,
  type ILearnerGrammarAtomsReader,
} from './ports/grammar-atoms.readers.js';

/**
 * The catalogue one learner's work is reviewed against (plan 85, step 3): the course's atoms
 * the learner has reached, those in their queue first, at most `MAX_CATALOG_ATOMS`.
 *
 * Never fails. A catalogue that cannot be read is an empty one, and the model is then asked
 * exactly what it was asked before plan 85 — remarks still reach the learner, they only name
 * no atom. An atom in the learner's queue from another course is left out: this course's
 * catalogue does not name it, and an atom the prompt cannot describe is not one to offer.
 */
@Injectable()
export class AtomCatalogResolver {
  private readonly logger = new Logger(AtomCatalogResolver.name);

  constructor(
    @Inject(LEARNER_GRAMMAR_ATOMS_READER) private readonly learners: ILearnerGrammarAtomsReader,
    @Inject(COURSE_ATOM_CATALOG_READER) private readonly courses: ICourseAtomCatalogReader,
  ) {}

  async forLearner(input: { userId: string; courseId: string | null; language: string }): Promise<AtomCatalog> {
    if (!input.courseId) return EMPTY_CATALOG;
    try {
      const [reached, course] = await Promise.all([
        this.learners.atoms(input.userId, input.courseId),
        this.courses.catalog(input.courseId, input.language),
      ]);
      const byId = new Map(course.map((atom) => [atom.atomId, atom]));
      const ordered = [
        ...reached.filter((atom) => atom.status === 'in_queue'),
        ...reached.filter((atom) => atom.status === 'covered'),
      ];
      const catalog: AtomCatalogEntry[] = [];
      for (const { atomId } of ordered) {
        const atom = byId.get(atomId);
        if (!atom) continue;
        catalog.push({ atomId, ruleTitle: atom.ruleTitle, title: atom.title, description: atom.description });
        if (catalog.length === MAX_CATALOG_ATOMS) break;
      }
      return catalog;
    } catch (err) {
      this.logger.warn(
        `Grammar atoms of ${input.userId} in course ${input.courseId} unreadable; reviewing without them: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return EMPTY_CATALOG;
    }
  }
}
