import { jest } from '@jest/globals';
import { AddReachedAtomHandler } from '../../../../../src/modules/srs/application/commands/add-reached-atom.handler.js';
import { AddReachedAtomCommand } from '../../../../../src/modules/srs/application/commands/add-reached-atom.command.js';
import { IntroduceCardCommand } from '../../../../../src/modules/srs/application/commands/introduce-card.command.js';
import { GetLearnerGrammarAtomsQuery } from '../../../../../src/modules/srs/application/queries/get-learner-grammar-atoms.query.js';
import type { LearnerGrammarAtomsResult } from '../../../../../src/modules/srs/application/queries/get-learner-grammar-atoms.handler.js';
import {
  SrsAtomCoverageUnavailableError,
  SrsAtomNotReachedError,
} from '../../../../../src/modules/srs/application/errors/srs-application.errors.js';
import { ReviewCard } from '../../../../../src/modules/srs/domain/entities/review-card.entity.js';
import { Result } from '../../../../../src/shared/kernel/result.js';

const NOW = new Date('2026-11-01T15:00:00Z');

function setup(existing: ReviewCard | null, reached: LearnerGrammarAtomsResult) {
  const repo = { findByUserAndContent: jest.fn(() => Promise.resolve(existing)) };
  const queryBus = { execute: jest.fn(() => Promise.resolve(reached)) };
  const introduced = { id: 'card-new' };
  const commandBus = { execute: jest.fn(() => Promise.resolve(Result.ok(introduced))) };
  const handler = new AddReachedAtomHandler(repo as never, queryBus as never, commandBus as never);
  const run = (atomId = 'atom-1') => handler.execute(new AddReachedAtomCommand('user-1', atomId, 'course-1'));
  return { run, repo, queryBus, commandBus, introduced };
}

describe('AddReachedAtomHandler (plan 85, step 6)', () => {
  it('introduces a covered atom as a shadow GRAMMAR_ATOM card', async () => {
    const { run, queryBus, commandBus, introduced } = setup(null, {
      atoms: [{ atomId: 'atom-1', status: 'covered' }],
      partial: false,
    });

    const result = await run();

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value).toBe(introduced);
    expect(queryBus.execute).toHaveBeenCalledWith(new GetLearnerGrammarAtomsQuery('user-1', 'course-1'));
    expect(commandBus.execute).toHaveBeenCalledWith(
      new IntroduceCardCommand('user-1', 'GRAMMAR_ATOM', 'atom-1', undefined, true),
    );
  });

  it('returns an existing card unchanged, suspended included, without reading coverage', async () => {
    const card = ReviewCard.create('user-1', 'GRAMMAR_ATOM', 'atom-1', 'grammar', NOW, NOW);
    card.suspend(NOW);
    const { run, queryBus, commandBus } = setup(card, { atoms: [], partial: false });

    const result = await run();

    expect(result.isOk && result.value.id).toBe(card.id);
    expect(result.isOk && result.value.state).toBe('SUSPENDED');
    expect(queryBus.execute).not.toHaveBeenCalled();
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('refuses an atom the learner has not reached', async () => {
    const { run, commandBus } = setup(null, {
      atoms: [{ atomId: 'atom-other', status: 'covered' }],
      partial: false,
    });

    const result = await run();

    expect(result.isFail && result.error).toBeInstanceOf(SrsAtomNotReachedError);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('does not call an atom unreached when coverage answered only in part', async () => {
    const { run, commandBus } = setup(null, { atoms: [], partial: true });

    const result = await run();

    expect(result.isFail && result.error).toBeInstanceOf(SrsAtomCoverageUnavailableError);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });
});
