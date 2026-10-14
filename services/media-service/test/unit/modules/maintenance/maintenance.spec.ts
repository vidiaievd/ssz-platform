import {
  OrphanSweepScheduler,
  SUPERSEDED_SWEEP_CRON,
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
  });

  it('does not take the service down when redis refuses the schedule', async () => {
    const queue = { upsertJobScheduler: jest.fn().mockRejectedValue(new Error('redis down')) };

    await expect(new OrphanSweepScheduler(queue as never).onModuleInit()).resolves.toBeUndefined();
  });
});

describe('MaintenanceWorker (plan 71)', () => {
  it('runs the sweep in the configured mode for the sweep job', async () => {
    const sweep = { run: jest.fn().mockResolvedValue({ scanned: 3 }) };

    const out = await new MaintenanceWorker(sweep as never, { run: jest.fn() } as never).process({
      name: SWEEP_ORPHANS_JOB,
    } as never);

    expect(sweep.run).toHaveBeenCalledWith();
    expect(out).toEqual({ scanned: 3 });
  });

  it('runs the replaced-narration sweep for its own job (plan 74)', async () => {
    const orphans = { run: jest.fn() };
    const superseded = { run: jest.fn().mockResolvedValue({ scanned: 2 }) };

    const out = await new MaintenanceWorker(orphans as never, superseded as never).process({
      name: SWEEP_SUPERSEDED_JOB,
    } as never);

    expect(superseded.run).toHaveBeenCalledWith();
    expect(orphans.run).not.toHaveBeenCalled();
    expect(out).toEqual({ scanned: 2 });
  });

  it('ignores a job it does not know', async () => {
    const sweep = { run: jest.fn() };

    expect(
      await new MaintenanceWorker(sweep as never, { run: jest.fn() } as never).process({ name: 'something-else' } as never),
    ).toBeNull();
    expect(sweep.run).not.toHaveBeenCalled();
  });
});
