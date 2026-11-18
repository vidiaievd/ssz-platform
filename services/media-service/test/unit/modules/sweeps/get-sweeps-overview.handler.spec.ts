import { GetSweepsOverviewHandler } from '../../../../src/modules/sweeps/application/queries/get-sweeps-overview/get-sweeps-overview.handler.js';
import type { SweepKind, SweepRunRecord } from '../../../../src/modules/sweeps/domain/sweep-run.js';

const run = (kind: SweepKind, report: Record<string, unknown> | null): SweepRunRecord => ({
  id: `${kind}-1`,
  kind,
  mode: 'dry-run',
  trigger: 'nightly',
  actorId: null,
  report,
  error: null,
  startedAt: new Date('2026-11-14T03:30:00.000Z'),
  finishedAt: new Date('2026-11-14T03:31:00.000Z'),
});

describe('GetSweepsOverviewHandler (plan 90, phase 8, step 3)', () => {
  it('answers every kind with its schedule, the nightly mode, its age limit and its recent runs', async () => {
    const runs = {
      recentByKind: jest.fn().mockResolvedValue({
        orphan_recordings: [run('orphan_recordings', { scanned: 4, inUse: 3, orphans: 1, deleted: 0 })],
        superseded_narrations: [],
        abandoned_uploads: [run('abandoned_uploads', null)],
        orphan_content: [],
      }),
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'orphanSweep'
          ? { mode: 'delete', minAgeDays: 30, maxPerRun: 2000 }
          : key === 'tts'
            ? { narrationRetentionDays: 45 }
            : undefined,
      ),
    };

    const out = await new GetSweepsOverviewHandler(runs as never, config as never).execute();

    expect(runs.recentByKind).toHaveBeenCalledWith(10);
    expect(out.historyDays).toBe(90);
    expect(out.items.map((item) => item.kind)).toEqual([
      'orphan_recordings',
      'superseded_narrations',
      'abandoned_uploads',
      'orphan_content',
    ]);
    expect(out.items[0]).toMatchObject({
      schedule: '30 3 * * *',
      nightlyMode: 'delete',
      minAgeDays: 30,
      ageBasis: 'created',
      maxPerRun: 2000,
    });
    expect(out.items[0]!.recentRuns[0]!.summary).toEqual({
      scanned: 4,
      kept: 3,
      candidates: 1,
      deleted: 0,
      aborted: false,
      skipped: false,
    });
    // Replaced narrations count from the replacement, over the retention period.
    expect(out.items[1]).toMatchObject({ minAgeDays: 45, ageBasis: 'superseded', recentRuns: [] });
    expect(out.items[2]!.recentRuns[0]!.summary).toBeNull();
  });
});
