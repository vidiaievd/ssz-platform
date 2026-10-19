import {
  SWEPT_CONTENT_TYPES,
  SweepOrphanContentAssetsService,
} from '../../../../src/modules/assets/application/services/sweep-orphan-content-assets.service.js';
import { Result } from '../../../../src/shared/kernel/result.js';

const NOW = new Date('2026-10-19T12:00:00Z');
const DAY = 86_400_000;

function asset(n: number, createdAt = new Date('2026-07-31T00:00:00Z')) {
  return { id: `a${n}`, entityType: 'lesson_asset', mimeType: { value: 'image/png' }, createdAt };
}

function make(opts: { mode?: 'dry-run' | 'delete'; maxPerRun?: number; minAgeDays?: number } = {}) {
  const calls: Array<{ types: readonly string[]; olderThan: Date; after: unknown; limit: number }> = [];
  let pages: Array<Array<ReturnType<typeof asset>>> = [];
  const repo = {
    findContentAssetsOlderThan: jest.fn(
      async (types: readonly string[], olderThan: Date, after: unknown, limit: number) => {
        calls.push({ types, olderThan, after, limit });
        return pages.shift() ?? [];
      },
    ),
  };
  const usage = { inUse: jest.fn() };
  const purger = { purge: jest.fn(async (_asset: unknown) => Result.ok()) };
  const config = {
    get: () => ({ mode: opts.mode ?? 'dry-run', minAgeDays: opts.minAgeDays ?? 30, maxPerRun: opts.maxPerRun ?? 2000 }),
  };
  const service = new SweepOrphanContentAssetsService(repo as never, usage as never, purger as never, config as never);
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

describe('SweepOrphanContentAssetsService (plan 76, 5.2)', () => {
  it('sweeps lesson files and exercise clips, never recordings or avatars', () => {
    expect(SWEPT_CONTENT_TYPES).toEqual(['lesson_asset', 'exercise_asset']);
  });

  it('a dry run deletes nothing, however many orphans it finds', async () => {
    const m = make({ mode: 'dry-run' });
    m.pages([[asset(1), asset(2)]]);
    m.usage.inUse.mockResolvedValue(Result.ok(new Set<string>()));

    const report = await m.service.run({ now: NOW });

    expect(m.purger.purge).not.toHaveBeenCalled();
    expect(report).toMatchObject({ mode: 'dry-run', scanned: 2, inUse: 0, orphans: 2, deleted: 0, aborted: false });
  });

  it('deletes only what content does not name', async () => {
    const m = make({ mode: 'delete' });
    m.pages([[asset(1), asset(2), asset(3)]]);
    m.usage.inUse.mockResolvedValue(Result.ok(new Set(['a2'])));

    const report = await m.service.run({ now: NOW });

    expect(m.purger.purge.mock.calls.map(([a]) => (a as { id: string }).id)).toEqual(['a1', 'a3']);
    expect(report).toMatchObject({ scanned: 3, inUse: 1, orphans: 2, deleted: 2 });
  });

  it('doubt is not deletion: when content cannot answer, nothing is deleted and the run stops', async () => {
    const m = make({ mode: 'delete' });
    m.pages([[asset(1)], [asset(2)]]);
    m.usage.inUse.mockResolvedValue(Result.fail('CONTENT_UNAVAILABLE'));

    const report = await m.service.run({ now: NOW });

    expect(m.purger.purge).not.toHaveBeenCalled();
    expect(m.repo.findContentAssetsOlderThan).toHaveBeenCalledTimes(1);
    expect(report).toMatchObject({ aborted: true, deleted: 0 });
  });

  it('asks for the swept kinds older than the minimum age', async () => {
    const m = make({ minAgeDays: 30 });

    await m.service.run({ now: NOW });

    expect(m.calls[0]!.types).toEqual(['lesson_asset', 'exercise_asset']);
    expect(m.calls[0]!.olderThan).toEqual(new Date(NOW.getTime() - 30 * DAY));
  });

  it('walks forward by cursor and stops at the per-run ceiling', async () => {
    const m = make({ mode: 'dry-run', maxPerRun: 250 });
    const first = Array.from({ length: 200 }, (_, i) => asset(i));
    m.pages([first, Array.from({ length: 50 }, (_, i) => asset(500 + i)), [asset(999)]]);
    m.usage.inUse.mockResolvedValue(Result.ok(new Set<string>()));

    const report = await m.service.run({ now: NOW });

    expect(m.calls.map((c) => c.limit)).toEqual([200, 50]);
    expect(m.calls[1]!.after).toEqual({ createdAt: first[199]!.createdAt, id: 'a199' });
    expect(report.scanned).toBe(250);
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
});
