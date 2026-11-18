import {
  ABANDONED_SWEEP_CRON,
  CONTENT_SWEEP_CRON,
  OrphanSweepScheduler,
  SUPERSEDED_SWEEP_CRON,
  SWEEP_ABANDONED_JOB,
  SWEEP_CONTENT_JOB,
  SWEEP_CRON,
  SWEEP_ORPHANS_JOB,
  SWEEP_SUPERSEDED_JOB,
} from '../../../../src/modules/maintenance/orphan-sweep.scheduler.js';
import { MaintenanceWorker } from '../../../../src/modules/maintenance/maintenance.worker.js';

describe('OrphanSweepScheduler (plan 71)', () => {
  it('declares one repeating job under a fixed id, so replicas and restarts share it', async () => {
    const queue = { upsertJobScheduler: jest.fn().mockResolvedValue(undefined) };

    await new OrphanSweepScheduler(queue as never).onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'orphan-recordings-daily',
      { pattern: SWEEP_CRON },
      { name: SWEEP_ORPHANS_JOB },
    );
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'superseded-narrations-daily',
      { pattern: SUPERSEDED_SWEEP_CRON },
      { name: SWEEP_SUPERSEDED_JOB },
    );
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'abandoned-uploads-daily',
      { pattern: ABANDONED_SWEEP_CRON },
      { name: SWEEP_ABANDONED_JOB },
    );
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'orphan-content-assets-daily',
      { pattern: CONTENT_SWEEP_CRON },
      { name: SWEEP_CONTENT_JOB },
    );
  });

  it('does not take the service down when redis refuses the schedule', async () => {
    const queue = { upsertJobScheduler: jest.fn().mockRejectedValue(new Error('redis down')) };

    await expect(new OrphanSweepScheduler(queue as never).onModuleInit()).resolves.toBeUndefined();
  });
});

describe('MaintenanceWorker (plan 71; plan 90, phase 8)', () => {
  it.each([
    [SWEEP_ORPHANS_JOB, 'orphan_recordings'],
    [SWEEP_SUPERSEDED_JOB, 'superseded_narrations'],
    [SWEEP_ABANDONED_JOB, 'abandoned_uploads'],
    [SWEEP_CONTENT_JOB, 'orphan_content'],
  ])('runs job %s as a nightly %s run in the configured mode', async (job, kind) => {
    const runner = { run: jest.fn().mockResolvedValue({ scanned: 3 }) };

    const out = await new MaintenanceWorker(runner as never).process({ name: job } as never);

    // No mode passed: the runner falls back to MEDIA_ORPHAN_SWEEP_MODE.
    expect(runner.run).toHaveBeenCalledWith(kind, { trigger: 'nightly' });
    expect(out).toEqual({ scanned: 3 });
  });

  it('ignores a job it does not know', async () => {
    const runner = { run: jest.fn() };

    expect(await new MaintenanceWorker(runner as never).process({ name: 'something-else' } as never)).toBeNull();
    expect(runner.run).not.toHaveBeenCalled();
  });
});
