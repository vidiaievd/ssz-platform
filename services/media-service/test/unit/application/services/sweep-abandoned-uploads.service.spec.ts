import { SweepAbandonedUploadsService } from '../../../../src/modules/assets/application/services/sweep-abandoned-uploads.service.js';
import { Result } from '../../../../src/shared/kernel/result.js';

const NOW = new Date('2026-10-19T12:00:00Z');
const DAY = 86_400_000;

function asset(n: number, createdAt = new Date('2026-07-31T00:00:00Z')) {
  return { id: `a${n}`, entityType: 'lesson_asset', createdAt };
}

function make(opts: { mode?: 'dry-run' | 'delete'; maxPerRun?: number; minAgeDays?: number } = {}) {
  const calls: Array<{ olderThan: Date; after: unknown; limit: number }> = [];
  let pages: Array<Array<ReturnType<typeof asset>>> = [];
  const repo = {
    findAbandonedUploadsOlderThan: jest.fn(async (olderThan: Date, after: unknown, limit: number) => {
      calls.push({ olderThan, after, limit });
      return pages.shift() ?? [];
    }),
  };
  const purger = { purge: jest.fn(async (_asset: unknown) => Result.ok()) };
  const config = {
    get: () => ({ mode: opts.mode ?? 'dry-run', minAgeDays: opts.minAgeDays ?? 30, maxPerRun: opts.maxPerRun ?? 2000 }),
  };
  const service = new SweepAbandonedUploadsService(repo as never, purger as never, config as never);
  return {
    service,
    repo,
    purger,
    calls,
    pages: (p: Array<Array<ReturnType<typeof asset>>>) => {
      pages = p;
    },
  };
}

describe('SweepAbandonedUploadsService (plan 76, 5.1)', () => {
  it('a dry run deletes nothing', async () => {
    const m = make({ mode: 'dry-run' });
    m.pages([[asset(1), asset(2)]]);

    const report = await m.service.run({ now: NOW });

    expect(m.purger.purge).not.toHaveBeenCalled();
    expect(report).toEqual({ mode: 'dry-run', scanned: 2, deleted: 0, skipped: false });
  });

  it('in delete mode purges every pending upload it is handed', async () => {
    const m = make({ mode: 'delete' });
    m.pages([[asset(1), asset(2)]]);

    const report = await m.service.run({ now: NOW });

    expect(m.purger.purge.mock.calls.map(([a]) => (a as { id: string }).id)).toEqual(['a1', 'a2']);
    expect(report).toMatchObject({ scanned: 2, deleted: 2 });
  });

  it('a manual dry run wins over the configured delete mode', async () => {
    const m = make({ mode: 'delete' });
    m.pages([[asset(1)]]);

    const report = await m.service.run({ mode: 'dry-run', now: NOW });

    expect(m.purger.purge).not.toHaveBeenCalled();
    expect(report.mode).toBe('dry-run');
  });

  it('asks only for rows older than the minimum age', async () => {
    const m = make({ minAgeDays: 30 });

    await m.service.run({ now: NOW });

    expect(m.calls[0]!.olderThan).toEqual(new Date(NOW.getTime() - 30 * DAY));
  });

  it('walks forward by cursor and stops at the per-run ceiling', async () => {
    const m = make({ mode: 'dry-run', maxPerRun: 250 });
    const first = Array.from({ length: 200 }, (_, i) => asset(i));
    m.pages([first, Array.from({ length: 50 }, (_, i) => asset(500 + i)), [asset(999)]]);

    const report = await m.service.run({ now: NOW });

    expect(m.calls.map((c) => c.limit)).toEqual([200, 50]);
    expect(m.calls[1]!.after).toEqual({ createdAt: first[199]!.createdAt, id: 'a199' });
    expect(report.scanned).toBe(250);
  });

  it('one upload that will not delete does not stop the others', async () => {
    const m = make({ mode: 'delete' });
    m.pages([[asset(1), asset(2)]]);
    m.purger.purge.mockRejectedValueOnce(new Error('storage down') as never);

    const report = await m.service.run({ now: NOW });

    expect(m.purger.purge).toHaveBeenCalledTimes(2);
    expect(report.deleted).toBe(1);
  });
});
