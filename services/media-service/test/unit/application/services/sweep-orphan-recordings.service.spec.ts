import { SweepOrphanRecordingsService } from '../../../../src/modules/assets/application/services/sweep-orphan-recordings.service.js';
import { Result } from '../../../../src/shared/kernel/result.js';

const NOW = new Date('2026-10-07T12:00:00Z');
const DAY = 86_400_000;

function asset(n: number, createdAt = new Date('2026-08-01T00:00:00Z')) {
  return { id: `a${n}`, entityId: `att-${n}`, createdAt };
}

function make(opts: { mode?: 'dry-run' | 'delete'; maxPerRun?: number; minAgeDays?: number } = {}) {
  const calls: Array<{ olderThan: Date; after: unknown; limit: number }> = [];
  let pages: Array<Array<ReturnType<typeof asset>>> = [];
  const repo = {
    findRecordingsOlderThan: jest.fn(async (olderThan: Date, after: unknown, limit: number) => {
      calls.push({ olderThan, after, limit });
      return pages.shift() ?? [];
    }),
  };
  const usage = { inUse: jest.fn() };
  const purger = { purge: jest.fn(async (_asset: unknown) => Result.ok()) };
  const config = {
    get: () => ({ mode: opts.mode ?? 'dry-run', minAgeDays: opts.minAgeDays ?? 30, maxPerRun: opts.maxPerRun ?? 2000 }),
  };
  const service = new SweepOrphanRecordingsService(repo as never, usage as never, purger as never, config as never);
  return {
    service,
    repo,
    usage,
    purger,
    calls,
    pages: (p: Array<Array<ReturnType<typeof asset>>>) => {
      pages = p;
    },
  };
}

describe('SweepOrphanRecordingsService (plan 71)', () => {
  it('a dry run deletes nothing, however many orphans it finds', async () => {
    const m = make({ mode: 'dry-run' });
    m.pages([[asset(1), asset(2)]]);
    m.usage.inUse.mockResolvedValue(Result.ok(new Set<string>()));

    const report = await m.service.run({ now: NOW });

    expect(m.purger.purge).not.toHaveBeenCalled();
    expect(report).toMatchObject({ mode: 'dry-run', scanned: 2, inUse: 0, orphans: 2, deleted: 0, aborted: false });
  });

  it('deletes only what no attempt stands on', async () => {
    const m = make({ mode: 'delete' });
    m.pages([[asset(1), asset(2), asset(3)]]);
    m.usage.inUse.mockResolvedValue(Result.ok(new Set(['a2'])));

    const report = await m.service.run({ now: NOW });

    expect(m.purger.purge.mock.calls.map(([a]) => (a as { id: string }).id)).toEqual(['a1', 'a3']);
    expect(report).toMatchObject({ scanned: 3, inUse: 1, orphans: 2, deleted: 2 });
  });

  it('doubt is not deletion: when the engine cannot answer, nothing is deleted and the run stops', async () => {
    const m = make({ mode: 'delete' });
    m.pages([[asset(1)], [asset(2)]]);
    m.usage.inUse.mockResolvedValue(Result.fail('ENGINE_UNAVAILABLE'));

    const report = await m.service.run({ now: NOW });

    expect(m.purger.purge).not.toHaveBeenCalled();
    expect(m.repo.findRecordingsOlderThan).toHaveBeenCalledTimes(1);
    expect(report).toMatchObject({ aborted: true, deleted: 0 });
  });

  it('asks for files older than the minimum age, and passes the same cut-off for live drafts', async () => {
    const m = make({ minAgeDays: 30 });
    m.pages([[asset(1)]]);
    m.usage.inUse.mockResolvedValue(Result.ok(new Set<string>()));

    await m.service.run({ now: NOW });

    const cutOff = new Date(NOW.getTime() - 30 * DAY);
    expect(m.calls[0]!.olderThan).toEqual(cutOff);
    expect(m.usage.inUse).toHaveBeenCalledWith(['a1'], cutOff);
  });

  it('walks forward by cursor, one batch after another', async () => {
    const m = make({ mode: 'dry-run' });
    const first = Array.from({ length: 200 }, (_, i) => asset(i));
    m.pages([first, [asset(900)]]);
    m.usage.inUse.mockResolvedValue(Result.ok(new Set<string>()));

    const report = await m.service.run({ now: NOW });

    expect(m.calls).toHaveLength(2);
    expect(m.calls[0]!.after).toBeNull();
    expect(m.calls[1]!.after).toEqual({ createdAt: first[199]!.createdAt, id: 'a199' });
    expect(report.scanned).toBe(201);
  });

  it('is bounded: it stops at the per-run ceiling', async () => {
    const m = make({ mode: 'dry-run', maxPerRun: 250 });
    m.pages([Array.from({ length: 200 }, (_, i) => asset(i)), Array.from({ length: 50 }, (_, i) => asset(500 + i)), [asset(999)]]);
    m.usage.inUse.mockResolvedValue(Result.ok(new Set<string>()));

    const report = await m.service.run({ now: NOW });

    expect(report.scanned).toBe(250);
    expect(m.calls.map((c) => c.limit)).toEqual([200, 50]);
  });

  it('one file that will not delete does not stop the others', async () => {
    const m = make({ mode: 'delete' });
    m.pages([[asset(1), asset(2)]]);
    m.usage.inUse.mockResolvedValue(Result.ok(new Set<string>()));
    m.purger.purge.mockRejectedValueOnce(new Error('storage down') as never);

    const report = await m.service.run({ now: NOW });

    expect(m.purger.purge).toHaveBeenCalledTimes(2);
    expect(report).toMatchObject({ orphans: 2, deleted: 1 });
  });

  it('a manual dry run overrides a configured delete mode', async () => {
    const m = make({ mode: 'delete' });
    m.pages([[asset(1)]]);
    m.usage.inUse.mockResolvedValue(Result.ok(new Set<string>()));

    const report = await m.service.run({ mode: 'dry-run', now: NOW });

    expect(m.purger.purge).not.toHaveBeenCalled();
    expect(report.mode).toBe('dry-run');
  });

  it('does nothing when another run is still going on this node', async () => {
    const m = make({ mode: 'delete' });
    m.pages([[asset(1)]]);
    let release!: (v: unknown) => void;
    m.usage.inUse.mockImplementation(() => new Promise((resolve) => (release = resolve)));

    const first = m.service.run({ now: NOW });
    await Promise.resolve();
    await Promise.resolve();
    const second = await m.service.run({ now: NOW });
    release(Result.ok(new Set<string>()));
    await first;

    expect(second).toMatchObject({ skipped: true, scanned: 0, deleted: 0 });
    expect(m.purger.purge).toHaveBeenCalledTimes(1);
  });

  it('has nothing to say when there is nothing old enough', async () => {
    const m = make({ mode: 'delete' });

    const report = await m.service.run({ now: NOW });

    expect(m.usage.inUse).not.toHaveBeenCalled();
    expect(report).toMatchObject({ scanned: 0, deleted: 0, aborted: false });
  });
});
