import { jest } from '@jest/globals';
import { PruneGapCardsHandler } from '../../../../../src/modules/srs/application/commands/prune-gap-cards.handler.js';
import { PruneGapCardsCommand } from '../../../../../src/modules/srs/application/commands/prune-gap-cards.command.js';
import type { ISrsRepository } from '../../../../../src/modules/srs/domain/repositories/srs-repository.interface.js';
import type { RedisDueQueueService } from '../../../../../src/modules/srs/infrastructure/cache/redis-due-queue.service.js';

// Plan 68: a gap card on a deleted piece is never rated again, so it goes — and the learners
// who held one get their cached due queue dropped, or the id would still be served.

const EXERCISE_ID = 'eeeeeeee-0000-4000-8000-000000000001';

function makeDeps(learners: string[]) {
  const repo = {
    deleteGapCardsExcept: jest
      .fn<(exerciseId: string, keep: readonly string[]) => Promise<string[]>>()
      .mockResolvedValue(learners),
  } as unknown as ISrsRepository;
  const dueQueue = {
    invalidate: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as RedisDueQueueService;
  return { repo, dueQueue };
}

describe('PruneGapCardsHandler', () => {
  it('deletes the cards of pieces the exercise no longer has and drops those queues', async () => {
    const { repo, dueQueue } = makeDeps(['u1', 'u2']);
    const handler = new PruneGapCardsHandler(repo, dueQueue);

    const pruned = await handler.execute(new PruneGapCardsCommand(EXERCISE_ID, ['s1', 's3']));

    expect(pruned).toBe(2);
    expect(repo.deleteGapCardsExcept).toHaveBeenCalledWith(EXERCISE_ID, ['s1', 's3']);
    expect(dueQueue.invalidate).toHaveBeenCalledWith('u1');
    expect(dueQueue.invalidate).toHaveBeenCalledWith('u2');
  });

  it('touches no queue when nobody held a card on a deleted piece', async () => {
    const { repo, dueQueue } = makeDeps([]);
    const handler = new PruneGapCardsHandler(repo, dueQueue);

    expect(await handler.execute(new PruneGapCardsCommand(EXERCISE_ID, ['s1']))).toBe(0);
    expect(dueQueue.invalidate).not.toHaveBeenCalled();
  });
});
