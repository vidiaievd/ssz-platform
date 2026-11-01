import { jest } from '@jest/globals';
import type { ExerciseFeedbackAtomsFlaggedPayload } from '@ssz/contracts';
import { ApplyFlaggedAtomsHandler } from '../../../../../src/modules/srs/application/commands/apply-flagged-atoms.handler.js';
import { ApplyFlaggedAtomsCommand } from '../../../../../src/modules/srs/application/commands/apply-flagged-atoms.command.js';
import { ReviewCard } from '../../../../../src/modules/srs/domain/entities/review-card.entity.js';
import type { AtomFlagEntry } from '../../../../../src/modules/srs/domain/repositories/atom-flag-log.interface.js';
import { Result } from '../../../../../src/shared/kernel/result.js';

const NOW = new Date('2026-11-01T15:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function card(atomId: string, dueInDays: number, suspended = false): ReviewCard {
  const c = ReviewCard.create('user-1', 'GRAMMAR_ATOM', atomId, 'grammar', NOW, new Date(NOW.getTime() + dueInDays * DAY));
  if (suspended) c.suspend(NOW);
  c.clearDomainEvents();
  return c;
}

function payload(
  source: ExerciseFeedbackAtomsFlaggedPayload['source'],
  atoms: Array<[string, boolean]>,
  extra: Partial<ExerciseFeedbackAtomsFlaggedPayload> = {},
): ExerciseFeedbackAtomsFlaggedPayload {
  return {
    userId: 'user-1',
    exerciseId: 'ex-1',
    attemptId: 'att-1',
    templateCode: 'writing_task',
    source,
    atoms: atoms.map(([atomId, inExerciseTargets]) => ({ atomType: 'grammar_rule_atom', atomId, inExerciseTargets })),
    schoolId: 'school-1',
    containerId: 'course-1',
    groupId: null,
    occurredAt: '2026-11-01T23:30:00+00:00',
    ...extra,
  };
}

function setup(cards: ReviewCard[], seen: string[] = []) {
  const byAtom = new Map(cards.map((c) => [c.contentId, c]));
  const repo = {
    findByUserAndContent: jest.fn((_u: string, _t: string, atomId: string) => Promise.resolve(byAtom.get(atomId) ?? null)),
    save: jest.fn(() => Promise.resolve()),
  };
  const recorded: AtomFlagEntry[] = [];
  const flags = {
    record: jest.fn((entry: AtomFlagEntry) => {
      if (seen.includes(entry.atomId)) return Promise.resolve('duplicate' as const);
      recorded.push(entry);
      return Promise.resolve('recorded' as const);
    }),
  };
  const dueQueue = { upsert: jest.fn(() => Promise.resolve()) };
  const commandBus = { execute: jest.fn(() => Promise.resolve(Result.ok({}))) };
  const handler = new ApplyFlaggedAtomsHandler(
    repo as never,
    flags,
    { now: () => NOW },
    dueQueue as never,
    commandBus as never,
  );
  const run = (p: ExerciseFeedbackAtomsFlaggedPayload) => handler.execute(new ApplyFlaggedAtomsCommand(p));
  return { run, repo, flags, recorded, dueQueue, commandBus };
}

describe('ApplyFlaggedAtomsHandler (plan 85, step 5)', () => {
  it('pulls a card due later to within a day, without rating it (rule 2)', async () => {
    const far = card('atom-far', 20);
    const { run, repo, commandBus, dueQueue } = setup([far]);

    const outcomes = await run(payload('ai_precheck', [['atom-far', false]]));

    expect(outcomes).toEqual(['pulled']);
    expect(far.dueAt).toEqual(new Date(NOW.getTime() + DAY));
    expect(far.reps).toBe(0);
    expect(far.state).toBe('NEW');
    expect(repo.save).toHaveBeenCalledWith(far);
    expect(commandBus.execute).not.toHaveBeenCalled();
    // A shadow card stays out of the cached due queue.
    expect(dueQueue.upsert).not.toHaveBeenCalled();
  });

  it('leaves a card already due alone, and the same for a model’s mark on a target', async () => {
    const soon = card('atom-soon', 0.5);
    const { run, repo } = setup([soon]);

    expect(await run(payload('ai_review', [['atom-soon', true]]))).toEqual(['already_due']);
    expect(soon.dueAt).toEqual(new Date(NOW.getTime() + 0.5 * DAY));
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('records one row per atom and source a UTC day — a second rehearsal changes nothing (rule 3)', async () => {
    const far = card('atom-far', 20);
    const { run, recorded, repo } = setup([far], ['atom-far']);

    expect(await run(payload('ai_precheck', [['atom-far', false]]))).toEqual([]);
    expect(recorded).toEqual([]);
    expect(repo.save).not.toHaveBeenCalled();
    expect(far.dueAt).toEqual(new Date(NOW.getTime() + 20 * DAY));
  });

  it('writes the row with the day of the signal and what was done', async () => {
    const { run, recorded } = setup([card('atom-far', 20)]);

    await run(payload('ai_precheck', [['atom-far', false], ['atom-none', false]]));

    expect(recorded).toEqual([
      expect.objectContaining({
        userId: 'user-1',
        exerciseId: 'ex-1',
        attemptId: 'att-1',
        atomId: 'atom-far',
        source: 'ai_precheck',
        outcome: 'pulled',
        flaggedOn: new Date('2026-11-01T00:00:00Z'),
        schoolId: 'school-1',
        containerId: 'course-1',
        groupId: null,
      }),
      expect.objectContaining({ atomId: 'atom-none', outcome: 'no_card' }),
    ]);
  });

  it('rates a teacher’s mark outside the exercise’s targets as a lapse, in shadow (rule 5)', async () => {
    const c = card('atom-t', 20);
    const { run, commandBus } = setup([c]);

    expect(await run(payload('teacher', [['atom-t', false]]))).toEqual(['lapsed']);
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', cardId: c.id, rating: 'AGAIN', shadow: true }),
    );
  });

  it('leaves a teacher’s mark on one of the targets to the hand-in’s rating (rule 5)', async () => {
    const c = card('atom-t', 20);
    const { run, commandBus, repo } = setup([c]);

    expect(await run(payload('teacher', [['atom-t', true]]))).toEqual(['in_targets']);
    expect(commandBus.execute).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('never touches a suspended card, and skips atoms of other kinds', async () => {
    const s = card('atom-s', 20, true);
    const { run, recorded, repo, commandBus } = setup([s]);

    const outcomes = await run({
      ...payload('teacher', [['atom-s', false]]),
      atoms: [
        { atomType: 'grammar_rule_atom', atomId: 'atom-s', inExerciseTargets: false },
        { atomType: 'vocabulary_item', atomId: 'word-1', inExerciseTargets: false },
      ],
    });

    expect(outcomes).toEqual(['suspended']);
    expect(recorded.map((r) => r.atomId)).toEqual(['atom-s']);
    expect(repo.save).not.toHaveBeenCalled();
    expect(commandBus.execute).not.toHaveBeenCalled();
  });
});
