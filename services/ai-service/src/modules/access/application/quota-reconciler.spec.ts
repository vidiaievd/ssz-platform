import type { QuotaKey } from '../domain/quota.js';
import type { IQuotaCounter } from './ports/quota-counter.js';
import { QuotaReconciler } from './quota-reconciler.js';

const key = (capability: string, end: string): QuotaKey => ({
  payer: { type: 'workspace', id: 'w1' },
  capability,
  periodStart: new Date('2026-10-01T00:00:00Z'),
  periodEnd: new Date(end),
});

function setup(counters: Array<{ key: QuotaKey; value: bigint }>, ledger: Record<string, bigint>, locked = false) {
  const raised: Array<[string, bigint]> = [];
  const reads: Array<[string, Date]> = [];
  let released = false;
  const counter = {
    async *list() {
      yield* counters;
    },
    raiseTo: async (k: QuotaKey, spent: bigint) => void raised.push([k.capability, spent]),
    tryLock: async () => (locked ? null : { release: async () => void (released = true) }),
  } as unknown as IQuotaCounter;
  const reconciler = new QuotaReconciler(
    counter,
    {
      microCreditsSpent: async (_p, capability, _from, to) => {
        reads.push([capability, to]);
        return ledger[capability] ?? 0n;
      },
    },
    86_400_000,
  );
  return { reconciler, raised, reads, released: () => released };
}

describe('QuotaReconciler', () => {
  const now = new Date('2026-10-21T12:00:00Z');

  it('raises a counter behind the ledger and leaves one ahead of it alone', async () => {
    const { reconciler, raised, released } = setup(
      [
        { key: key('behind', '2026-11-01T00:00:00Z'), value: 1n },
        { key: key('ahead', '2026-11-01T00:00:00Z'), value: 9n },
      ],
      { behind: 5n, ahead: 3n },
    );
    expect(await reconciler.reconcileOnce(now)).toEqual({ checked: 2, raised: 1 });
    expect(raised).toEqual([['behind', 5n]]);
    expect(released()).toBe(true);
  });

  it('reads the ledger up to now in a running period and up to its end in a past one', async () => {
    const { reconciler, reads } = setup(
      [
        { key: key('running', '2026-11-01T00:00:00Z'), value: 0n },
        { key: key('past', '2026-10-15T00:00:00Z'), value: 0n },
      ],
      {},
    );
    await reconciler.reconcileOnce(now);
    expect(reads).toEqual([
      ['running', now],
      ['past', new Date('2026-10-15T00:00:00Z')],
    ]);
  });

  it('does nothing while another instance holds the lock', async () => {
    const { reconciler, reads } = setup([{ key: key('x', '2026-11-01T00:00:00Z'), value: 0n }], { x: 5n }, true);
    expect(await reconciler.reconcileOnce(now)).toBeNull();
    expect(reads).toEqual([]);
  });
});
