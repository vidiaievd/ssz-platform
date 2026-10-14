import { SweepSupersededNarrationsService } from '../../../../src/modules/assets/application/services/sweep-superseded-narrations.service.js';
import { Result } from '../../../../src/shared/kernel/result.js';

const NOW = new Date('2026-12-01T12:00:00Z');
const DAY = 86_400_000;

function replaced(n: number, supersededAt = new Date('2026-10-01T00:00:00Z')) {
  const asset = {
    id: `n${n}`,
    supersededAt: supersededAt as Date | null,
    supersededBy: `new-${n}`,
    restore: jest.fn(() => {
      asset.supersededAt = null;
    }),
  };
  return asset;
}

function make(opts: { mode?: 'dry-run' | 'delete'; maxPerRun?: number; retentionDays?: number } = {}) {
  const calls: Array<{ before: Date; after: unknown; limit: number }> = [];
  let pages: Array<Array<ReturnType<typeof replaced>>> = [];
  const repo = {
    findSupersededBefore: jest.fn(async (before: Date, after: unknown, limit: number) => {
      calls.push({ before, after, limit });
      return pages.shift() ?? [];
    }),
    save: jest.fn(async (_asset: unknown) => undefined),
  };
  const usage = { inUse: jest.fn() };
  const purger = { purge: jest.fn(async (_asset: unknown) => Result.ok()) };
  const config = {
    get: (key: string) =>
      key === 'tts'
        ? { narrationRetentionDays: opts.retentionDays ?? 30 }
        : { mode: opts.mode ?? 'dry-run', minAgeDays: 30, maxPerRun: opts.maxPerRun ?? 2000 },
  };
  const service = new SweepSupersededNarrationsService(repo as never, usage as never, purger as never, config as never);
  return { service, repo, usage, purger, calls, pages: (p: typeof pages) => (pages = p) };
}

describe('SweepSupersededNarrationsService (plan 74, D5)', () => {
  it('looks only past the retention period', async () => {
    const m = make({ retentionDays: 30 });
    await m.service.run({ now: NOW });
    expect(m.calls[0]!.before).toEqual(new Date(NOW.getTime() - 30 * DAY));
  });

  it('a dry run deletes and restores nothing', async () => {
    const m = make({ mode: 'dry-run' });
    const kept = replaced(2);
    m.pages([[replaced(1), kept]]);
    m.usage.inUse.mockResolvedValue(Result.ok(new Set(['n2'])));

    const report = await m.service.run({ now: NOW });

    expect(m.purger.purge).not.toHaveBeenCalled();
    expect(kept.restore).not.toHaveBeenCalled();
    expect(m.repo.save).not.toHaveBeenCalled();
    expect(report).toMatchObject({ mode: 'dry-run', scanned: 2, inUse: 1, unused: 1, deleted: 0 });
  });

  it('deletes what no lesson body names and clears the mark on the rest', async () => {
    const m = make({ mode: 'delete' });
    const kept = replaced(2);
    m.pages([[replaced(1), kept, replaced(3)]]);
    m.usage.inUse.mockResolvedValue(Result.ok(new Set(['n2'])));

    const report = await m.service.run({ now: NOW });

    expect(m.purger.purge.mock.calls.map(([a]) => (a as { id: string }).id)).toEqual(['n1', 'n3']);
    expect(kept.restore).toHaveBeenCalled();
    expect(m.repo.save).toHaveBeenCalledWith(kept);
    expect(report).toMatchObject({ scanned: 3, inUse: 1, unused: 2, deleted: 2 });
  });

  it('stops without deleting when content-service cannot answer', async () => {
    const m = make({ mode: 'delete' });
    m.pages([[replaced(1)], [replaced(2)]]);
    m.usage.inUse.mockResolvedValue(Result.fail('CONTENT_UNAVAILABLE'));

    const report = await m.service.run({ now: NOW });

    expect(m.purger.purge).not.toHaveBeenCalled();
    expect(report).toMatchObject({ aborted: true, scanned: 0, deleted: 0 });
    expect(m.repo.findSupersededBefore).toHaveBeenCalledTimes(1);
  });

  it('moves the cursor past a full page even when its last asset was restored', async () => {
    const m = make({ mode: 'delete', maxPerRun: 400 });
    const t = new Date('2026-10-01T00:00:00Z');
    // A full page (the batch is 200) makes the sweep ask for the next one.
    const page = Array.from({ length: 200 }, (_, n) => replaced(n, t));
    m.pages([page, [replaced(999, t)]]);
    m.usage.inUse.mockResolvedValue(Result.ok(new Set(['n199'])));

    await m.service.run({ now: NOW });

    expect(page[199]!.restore).toHaveBeenCalled();
    expect(m.calls[1]!.after).toEqual({ supersededAt: t, id: 'n199' });
  });
});
