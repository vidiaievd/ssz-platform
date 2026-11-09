import { jest } from '@jest/globals';
import { GetLearnerGrammarAtomsHandler } from '../../../../../src/modules/srs/application/queries/get-learner-grammar-atoms.handler.js';
import { GetLearnerGrammarAtomsQuery } from '../../../../../src/modules/srs/application/queries/get-learner-grammar-atoms.query.js';
import type { ISrsRepository } from '../../../../../src/modules/srs/domain/repositories/srs-repository.interface.js';
import type { IEnrollmentRepository } from '../../../../../src/modules/enrollments/domain/repositories/enrollment.repository.interface.js';
import type { IProgressRepository } from '../../../../../src/modules/progress/domain/repositories/progress.repository.interface.js';
import {
  ContentClientError,
  type ContainerAtomCoverageRef,
  type IContentClient,
} from '../../../../../src/shared/application/ports/content-client.port.js';
import { Result } from '../../../../../src/shared/kernel/result.js';

const USER = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';
const COURSE = 'course-1';
const UNIT_A = 'unit-a';
const UNIT_B = 'unit-b';
const RULE_A = 'rule-a';
const RULE_FLAT = 'rule-flat';

interface Fixture {
  cards?: Array<{ contentId: string; state: string }>;
  enrollmentStatus?: 'ACTIVE' | 'COMPLETED' | 'UNENROLLED' | null;
  leaves?: Array<{ type: string; id: string; moduleId: string | null }> | 'fail';
  touched?: string[];
  coverage?: Record<string, ContainerAtomCoverageRef | 'fail'>;
}

const grammarAtom = (atomId: string, parentId: string, introducedBy: string[] = ['relation']) => ({
  atomType: 'grammar_rule_atom',
  atomId,
  parentId,
  introducedBy,
});

function makeHandler(f: Fixture) {
  const srsRepo = {
    findAllByUserAndTypeIncludingShadow: jest.fn(async () => f.cards ?? []),
  } as unknown as ISrsRepository;

  const enrollmentRepo = {
    findByUserAndContainer: jest.fn(async () =>
      f.enrollmentStatus === null ? null : { status: f.enrollmentStatus ?? 'ACTIVE' },
    ),
  } as unknown as IEnrollmentRepository;

  const progressRepo = {
    findByUserAndContentIds: jest.fn(async () =>
      (f.touched ?? []).map((id) => ({ status: 'IN_PROGRESS', contentRef: { id } })),
    ),
  } as unknown as IProgressRepository;

  const getContainerAtomCoverage = jest.fn(async (id: string) => {
    const report = f.coverage?.[id];
    if (report === 'fail') return Result.fail(new ContentClientError('down', 503));
    return Result.ok(report ?? { available: true, atoms: [] });
  });
  const contentClient = {
    getCourseLeafItems: jest.fn(async () =>
      f.leaves === 'fail'
        ? Result.fail(new ContentClientError('down', 503))
        : Result.ok(
            (f.leaves ?? []).map((leaf) => ({
              ref: { type: leaf.type, id: leaf.id },
              moduleId: leaf.moduleId,
              isRequired: true,
            })),
          ),
    ),
    getContainerAtomCoverage,
  } as unknown as IContentClient;

  return {
    handler: new GetLearnerGrammarAtomsHandler(srsRepo, enrollmentRepo, progressRepo, contentClient),
    getContainerAtomCoverage,
  };
}

const run = (f: Fixture, courseId: string | null = COURSE) => {
  const { handler, getContainerAtomCoverage } = makeHandler(f);
  return handler
    .execute(new GetLearnerGrammarAtomsQuery(USER, courseId))
    .then((result) => ({ result, getContainerAtomCoverage }));
};

describe('GetLearnerGrammarAtomsHandler', () => {
  it('answers only the queue when no course is named, suspended cards left out', async () => {
    const { result, getContainerAtomCoverage } = await run(
      { cards: [{ contentId: 'q1', state: 'REVIEW' }, { contentId: 's1', state: 'SUSPENDED' }] },
      null,
    );

    expect(result).toEqual({ atoms: [{ atomId: 'q1', status: 'in_queue' }], partial: false });
    expect(getContainerAtomCoverage).not.toHaveBeenCalled();
  });

  it('covers atoms introduced in a touched unit, not in an untouched one', async () => {
    const { result, getContainerAtomCoverage } = await run({
      leaves: [
        { type: 'LESSON', id: 'lesson-a', moduleId: UNIT_A },
        { type: 'LESSON', id: 'lesson-b', moduleId: UNIT_B },
      ],
      touched: ['lesson-a'],
      coverage: {
        [UNIT_A]: {
          available: true,
          atoms: [
            grammarAtom('introduced', 'rule-x'),
            grammarAtom('practised-only', 'rule-y', []),
            { atomType: 'vocabulary_item', atomId: 'word', parentId: null, introducedBy: ['glossary'] },
          ],
        },
      },
    });

    expect(result.atoms).toEqual([{ atomId: 'introduced', status: 'covered' }]);
    expect(getContainerAtomCoverage).toHaveBeenCalledTimes(1);
    expect(getContainerAtomCoverage).toHaveBeenCalledWith(UNIT_A);
  });

  it("takes every atom of a touched unit's own rule leaf, even one only practised there", async () => {
    const { result } = await run({
      leaves: [
        { type: 'LESSON', id: 'lesson-a', moduleId: UNIT_A },
        { type: 'GRAMMAR_RULE', id: RULE_A, moduleId: UNIT_A },
      ],
      touched: ['lesson-a'],
      coverage: { [UNIT_A]: { available: true, atoms: [grammarAtom('of-rule-a', RULE_A, [])] } },
    });

    expect(result.atoms).toEqual([{ atomId: 'of-rule-a', status: 'covered' }]);
  });

  it('in a flat course reads only the touched rule leaves from the course report', async () => {
    const { result, getContainerAtomCoverage } = await run({
      leaves: [
        { type: 'GRAMMAR_RULE', id: RULE_FLAT, moduleId: null },
        { type: 'GRAMMAR_RULE', id: 'rule-unread', moduleId: null },
      ],
      touched: [RULE_FLAT],
      coverage: {
        [COURSE]: {
          available: true,
          atoms: [grammarAtom('flat-1', RULE_FLAT), grammarAtom('unread-1', 'rule-unread')],
        },
      },
    });

    expect(result.atoms).toEqual([{ atomId: 'flat-1', status: 'covered' }]);
    expect(getContainerAtomCoverage).toHaveBeenCalledWith(COURSE);
  });

  it('reports an atom with a card as in_queue, a suspended one not at all', async () => {
    const { result } = await run({
      cards: [{ contentId: 'carded', state: 'LEARNING' }, { contentId: 'put-away', state: 'SUSPENDED' }],
      leaves: [{ type: 'LESSON', id: 'lesson-a', moduleId: UNIT_A }],
      touched: ['lesson-a'],
      coverage: {
        [UNIT_A]: {
          available: true,
          atoms: [grammarAtom('carded', 'r'), grammarAtom('put-away', 'r'), grammarAtom('fresh', 'r')],
        },
      },
    });

    expect(result.atoms).toEqual([
      { atomId: 'carded', status: 'in_queue' },
      { atomId: 'fresh', status: 'covered' },
    ]);
  });

  it('covers nothing in a course the learner left', async () => {
    const { result, getContainerAtomCoverage } = await run({
      enrollmentStatus: 'UNENROLLED',
      cards: [{ contentId: 'q1', state: 'REVIEW' }],
    });

    expect(result).toEqual({ atoms: [{ atomId: 'q1', status: 'in_queue' }], partial: false });
    expect(getContainerAtomCoverage).not.toHaveBeenCalled();
  });

  it('marks the answer partial when Content Service fails, keeping what it could read', async () => {
    const leavesDown = await run({ leaves: 'fail', cards: [{ contentId: 'q1', state: 'NEW' }] });
    expect(leavesDown.result).toEqual({ atoms: [{ atomId: 'q1', status: 'in_queue' }], partial: true });

    const oneUnitDown = await run({
      leaves: [
        { type: 'LESSON', id: 'lesson-a', moduleId: UNIT_A },
        { type: 'LESSON', id: 'lesson-b', moduleId: UNIT_B },
      ],
      touched: ['lesson-a', 'lesson-b'],
      coverage: { [UNIT_A]: 'fail', [UNIT_B]: { available: true, atoms: [grammarAtom('b1', 'r')] } },
    });
    expect(oneUnitDown.result).toEqual({ atoms: [{ atomId: 'b1', status: 'covered' }], partial: true });
  });
});
