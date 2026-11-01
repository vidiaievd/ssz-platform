import { Inject, Logger } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { GetLearnerGrammarAtomsQuery } from './get-learner-grammar-atoms.query.js';
import {
  SRS_REPOSITORY,
  type ISrsRepository,
} from '../../domain/repositories/srs-repository.interface.js';
import {
  ENROLLMENT_REPOSITORY,
  type IEnrollmentRepository,
} from '../../../enrollments/domain/repositories/enrollment.repository.interface.js';
import {
  PROGRESS_REPOSITORY,
  type IProgressRepository,
} from '../../../progress/domain/repositories/progress.repository.interface.js';
import {
  CONTENT_CLIENT,
  type IContentClient,
} from '../../../../shared/application/ports/content-client.port.js';

/**
 * `in_queue` — the learner has a grammar-atom card that is not suspended; a model's flag
 * pulls its due date in. `covered` — reached in the course, no card yet; a flag turns
 * into an offer to add it.
 */
export type LearnerGrammarAtomStatus = 'in_queue' | 'covered';

export interface LearnerGrammarAtomsResult {
  atoms: Array<{ atomId: string; status: LearnerGrammarAtomStatus }>;
  /**
   * True when Content Service failed for part of the course: the `covered` part is then
   * a lower bound. The queue is always complete — it is this service's own data.
   */
  partial: boolean;
}

const GRAMMAR_RULE_ATOM = 'grammar_rule_atom';

/**
 * Which grammar atoms a learner has reached — plan 85, step 1 (Q1, decided 01.11).
 *
 * The catalogue a model may point a mistake at. An atom outside it is one the learner
 * has not met yet, and an error there is the course's business, not the schedule's.
 *
 * "Reached" is per unit: an atom introduced in a unit where the learner opened or
 * finished anything, in a course they hold (active or completed). The unit as a whole
 * rather than the rule leaf, because a rule reaches a unit through relations, texts and
 * exercise pools far more often than as an item of its own. The rule leaves of that unit
 * are added on top, for a rule the coverage report counts only as practised. A leaf
 * directly under the course (a flat course) has no unit to stand for: there only its
 * own GRAMMAR_RULE leaves count.
 *
 * A suspended card is left out entirely — neither pulled in nor offered again: the
 * learner put it away on purpose.
 */
@QueryHandler(GetLearnerGrammarAtomsQuery)
export class GetLearnerGrammarAtomsHandler
  implements IQueryHandler<GetLearnerGrammarAtomsQuery, LearnerGrammarAtomsResult>
{
  private readonly logger = new Logger(GetLearnerGrammarAtomsHandler.name);

  constructor(
    @Inject(SRS_REPOSITORY) private readonly srsRepo: ISrsRepository,
    @Inject(ENROLLMENT_REPOSITORY) private readonly enrollmentRepo: IEnrollmentRepository,
    @Inject(PROGRESS_REPOSITORY) private readonly progressRepo: IProgressRepository,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
  ) {}

  async execute(query: GetLearnerGrammarAtomsQuery): Promise<LearnerGrammarAtomsResult> {
    const cards = await this.srsRepo.findAllByUserAndTypeIncludingShadow(query.userId, 'GRAMMAR_ATOM');
    const inQueue = new Set<string>();
    const suspended = new Set<string>();
    for (const card of cards) (card.state === 'SUSPENDED' ? suspended : inQueue).add(card.contentId);

    const { covered, partial } = query.courseId
      ? await this.covered(query.userId, query.courseId)
      : { covered: new Set<string>(), partial: false };

    const atoms: LearnerGrammarAtomsResult['atoms'] = [...inQueue].map((atomId) => ({
      atomId,
      status: 'in_queue' as const,
    }));
    for (const atomId of covered) {
      if (inQueue.has(atomId) || suspended.has(atomId)) continue;
      atoms.push({ atomId, status: 'covered' });
    }

    return { atoms, partial };
  }

  private async covered(
    userId: string,
    courseId: string,
  ): Promise<{ covered: Set<string>; partial: boolean }> {
    const covered = new Set<string>();

    const enrollment = await this.enrollmentRepo.findByUserAndContainer(userId, courseId);
    if (!enrollment || enrollment.status === 'UNENROLLED') return { covered, partial: false };

    const leavesResult = await this.contentClient.getCourseLeafItems(courseId);
    if (leavesResult.isFail) {
      this.logger.warn(`Course ${courseId} leaves unavailable: ${leavesResult.error.message}`);
      return { covered, partial: true };
    }
    const leaves = leavesResult.value;

    const progress = await this.progressRepo.findByUserAndContentIds(
      userId,
      leaves.map((leaf) => leaf.ref.id),
    );
    const touched = new Set(
      progress.filter((row) => row.status !== 'NOT_STARTED').map((row) => row.contentRef.id),
    );

    const touchedUnits = new Set<string>();
    // Rule leaves whose atoms count: every rule of a touched unit, and a touched rule
    // standing directly under the course.
    const reachedRules = new Set<string>();
    for (const leaf of leaves) {
      if (leaf.moduleId && touched.has(leaf.ref.id)) touchedUnits.add(leaf.moduleId);
    }
    for (const leaf of leaves) {
      if (leaf.ref.type !== 'GRAMMAR_RULE') continue;
      if (leaf.moduleId ? touchedUnits.has(leaf.moduleId) : touched.has(leaf.ref.id)) {
        reachedRules.add(leaf.ref.id);
      }
    }

    // A rule directly under the course has no unit report of its own to appear in.
    const hasDirectRule = leaves.some(
      (leaf) => leaf.moduleId === null && reachedRules.has(leaf.ref.id),
    );
    const scopes = [...touchedUnits, ...(hasDirectRule ? [courseId] : [])];

    let partial = false;
    const reports = await Promise.all(
      scopes.map(async (scopeId) => ({
        scopeId,
        result: await this.contentClient.getContainerAtomCoverage(scopeId),
      })),
    );
    for (const { scopeId, result } of reports) {
      if (result.isFail) {
        this.logger.warn(`Atom coverage of ${scopeId} unavailable: ${result.error.message}`);
        partial = true;
        continue;
      }
      const isUnit = scopeId !== courseId;
      for (const atom of result.value.atoms) {
        if (atom.atomType !== GRAMMAR_RULE_ATOM) continue;
        const ofReachedRule = atom.parentId !== null && reachedRules.has(atom.parentId);
        // The course-wide report says what the whole course introduces, which is not
        // what this learner reached; from it only the reached rules are taken.
        if (ofReachedRule || (isUnit && atom.introducedBy.length > 0)) covered.add(atom.atomId);
      }
    }

    return { covered, partial };
  }
}
