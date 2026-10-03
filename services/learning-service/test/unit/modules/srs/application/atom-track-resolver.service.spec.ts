import { jest } from '@jest/globals';
import { AtomTrackResolverService } from '../../../../../src/modules/srs/application/services/atom-track-resolver.service.js';
import { Result } from '../../../../../src/shared/kernel/result.js';
import { ContentClientError } from '../../../../../src/shared/application/ports/content-client.port.js';

const ATOM_ID = 'f0a5f7f4-9a23-4f07-bb08-6fc52a04d1a6';

function make(overrides: {
  describe?: jest.Mock;
  cached?: string | null;
  clientNull?: boolean;
} = {}) {
  const describeAtoms =
    overrides.describe ??
    jest.fn<() => Promise<unknown>>().mockResolvedValue(
      Result.ok([{ atomType: 'grammar_rule_atom', atomId: ATOM_ID, title: 'Gender', track: 'lexis', parentId: null }]),
    );

  const redisClient = overrides.clientNull
    ? null
    : {
        get: jest.fn<() => Promise<string | null>>().mockResolvedValue(overrides.cached ?? null),
        set: jest.fn<() => Promise<'OK'>>().mockResolvedValue('OK'),
      };

  const service = new AtomTrackResolverService(
    { describeAtoms } as any,
    { getClient: () => redisClient } as any,
  );

  return { service, describeAtoms, redisClient };
}

describe('AtomTrackResolverService', () => {
  it('answers for a word without asking Content Service at all', async () => {
    const { service, describeAtoms } = make();

    expect(await service.resolve('VOCABULARY_WORD', ATOM_ID)).toBe('lexis');
    expect(describeAtoms).not.toHaveBeenCalled();
  });

  // The pre-atom card types are the learner's real schedule until phase 7 retires them,
  // and they charge the budget they have always charged.
  it('puts the exercise-scoped types on the lexical track', async () => {
    const { service } = make();

    expect(await service.resolve('EXERCISE', ATOM_ID)).toBe('lexis');
    expect(await service.resolve('EXERCISE_GAP', `${ATOM_ID}#gap-1`)).toBe('lexis');
  });

  // The whole reason the column exists: gender is learned with the noun, however much
  // it lives inside a grammar rule (plan 63 §2 C).
  it('takes a grammar atom’s track from the atom, not from its kind', async () => {
    const { service, describeAtoms } = make();

    expect(await service.resolve('GRAMMAR_ATOM', ATOM_ID)).toBe('lexis');
    expect(describeAtoms).toHaveBeenCalledWith([
      { atomType: 'grammar_rule_atom', atomId: ATOM_ID },
    ]);
  });

  it('reads a cached answer instead of asking again', async () => {
    const { service, describeAtoms } = make({ cached: 'grammar' });

    expect(await service.resolve('GRAMMAR_ATOM', ATOM_ID)).toBe('grammar');
    expect(describeAtoms).not.toHaveBeenCalled();
  });

  it('caches what it learned', async () => {
    const { service, redisClient } = make();

    await service.resolve('GRAMMAR_ATOM', ATOM_ID);

    expect(redisClient!.set).toHaveBeenCalledWith(
      `srs:atom-track:${ATOM_ID}`,
      'lexis',
      'EX',
      expect.any(Number),
    );
  });

  // An attempt must not be nacked because Content Service is slow: the cost of being
  // wrong here is one card charged to the wrong budget.
  it('assumes grammar when the lookup fails', async () => {
    const { service } = make({
      describe: jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue(Result.fail(new ContentClientError('unreachable'))) as any,
    });

    expect(await service.resolve('GRAMMAR_ATOM', ATOM_ID)).toBe('grammar');
  });

  it('does not cache an address that resolved to nothing', async () => {
    const { service, redisClient } = make({
      describe: jest.fn<() => Promise<unknown>>().mockResolvedValue(Result.ok([])) as any,
    });

    expect(await service.resolve('GRAMMAR_ATOM', ATOM_ID)).toBe('grammar');
    expect(redisClient!.set).not.toHaveBeenCalled();
  });

  it('works with no Redis at all', async () => {
    const { service } = make({ clientNull: true });

    expect(await service.resolve('GRAMMAR_ATOM', ATOM_ID)).toBe('lexis');
  });
});
