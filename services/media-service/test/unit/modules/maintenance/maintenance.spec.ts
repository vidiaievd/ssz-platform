import { OrphanSweepScheduler, SWEEP_CRON, SWEEP_ORPHANS_JOB } from '../../../../src/modules/maintenance/orphan-sweep.scheduler.js';
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
  });

  it('does not take the service down when redis refuses the schedule', async () => {
    const queue = { upsertJobScheduler: jest.fn().mockRejectedValue(new Error('redis down')) };

    await expect(new OrphanSweepScheduler(queue as never).onModuleInit()).resolves.toBeUndefined();
  });
});

describe('MaintenanceWorker (plan 71)', () => {
  it('runs the sweep in the configured mode for the sweep job', async () => {
    const sweep = { run: jest.fn().mockResolvedValue({ scanned: 3 }) };

    const out = await new MaintenanceWorker(sweep as never).process({ name: SWEEP_ORPHANS_JOB } as never);

    expect(sweep.run).toHaveBeenCalledWith();
    expect(out).toEqual({ scanned: 3 });
  });

  it('ignores a job it does not know', async () => {
    const sweep = { run: jest.fn() };

    expect(await new MaintenanceWorker(sweep as never).process({ name: 'something-else' } as never)).toBeNull();
    expect(sweep.run).not.toHaveBeenCalled();
  });
});
