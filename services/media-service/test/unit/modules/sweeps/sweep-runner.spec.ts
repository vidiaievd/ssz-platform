import { SweepRunner } from '../../../../src/modules/sweeps/application/sweep-runner.js';

const NOW = new Date('2026-11-14T03:30:00.000Z');
const DAY_MS = 86_400_000;

function setup(configMode: 'dry-run' | 'delete' = 'dry-run') {
  const sweeps = {
    orphanRecordings: { run: jest.fn().mockResolvedValue({ mode: 'dry-run', scanned: 1 }) },
    supersededNarrations: { run: jest.fn().mockResolvedValue({ mode: 'dry-run', scanned: 2 }) },
    abandonedUploads: { run: jest.fn().mockResolvedValue({ mode: 'dry-run', scanned: 3 }) },
    orphanContent: { run: jest.fn().mockResolvedValue({ mode: 'dry-run', scanned: 4 }) },
  };
  const runs = {
    start: jest.fn().mockResolvedValue('run-1'),
    finish: jest.fn().mockResolvedValue(undefined),
    recentByKind: jest.fn(),
    deleteStartedBefore: jest.fn().mockResolvedValue(0),
  };
  const config = { get: jest.fn((key: string) => (key === 'orphanSweep' ? { mode: configMode } : undefined)) };
  const runner = new SweepRunner(
    sweeps.orphanRecordings as never,
    sweeps.supersededNarrations as never,
    sweeps.abandonedUploads as never,
    sweeps.orphanContent as never,
    runs as never,
    config as never,
  );
  return { runner, sweeps, runs };
}

describe('SweepRunner (plan 90, phase 8, step 3)', () => {
  it('runs the sweep of the kind and records the start and the report', async () => {
    const { runner, sweeps, runs } = setup();

    const out = await runner.run('superseded_narrations', { trigger: 'operator', mode: 'delete' }, () => NOW);

    expect(sweeps.supersededNarrations.run).toHaveBeenCalledWith({ mode: 'delete' });
    expect(sweeps.orphanRecordings.run).not.toHaveBeenCalled();
    expect(runs.start).toHaveBeenCalledWith({
      kind: 'superseded_narrations',
      mode: 'delete',
      trigger: 'operator',
      actorId: null,
      startedAt: NOW,
    });
    expect(runs.finish).toHaveBeenCalledWith('run-1', {
      report: { mode: 'dry-run', scanned: 2 },
      error: null,
      finishedAt: NOW,
    });
    expect(out).toEqual({ mode: 'dry-run', scanned: 2 });
  });

  it.each([
    ['orphan_recordings', 'orphanRecordings'],
    ['abandoned_uploads', 'abandonedUploads'],
    ['orphan_content', 'orphanContent'],
  ] as const)('sends %s to its own sweep', async (kind, service) => {
    const { runner, sweeps } = setup();

    await runner.run(kind, { trigger: 'operator', mode: 'dry-run' }, () => NOW);

    expect(sweeps[service].run).toHaveBeenCalledWith({ mode: 'dry-run' });
  });

  it('takes the configured mode when none is asked for, and writes it on the row', async () => {
    const { runner, sweeps, runs } = setup('delete');

    await runner.run('orphan_recordings', { trigger: 'nightly' }, () => NOW);

    expect(sweeps.orphanRecordings.run).toHaveBeenCalledWith({ mode: 'delete' });
    expect(runs.start).toHaveBeenCalledWith(expect.objectContaining({ mode: 'delete', trigger: 'nightly' }));
  });

  it('keeps the actor of an admin run', async () => {
    const { runner, runs } = setup();

    await runner.run('orphan_content', { trigger: 'admin', mode: 'dry-run', actorId: 'admin-1' }, () => NOW);

    expect(runs.start).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'admin', actorId: 'admin-1' }));
  });

  it('prunes history older than 90 days after a nightly run only', async () => {
    const { runner, runs } = setup();

    await runner.run('orphan_recordings', { trigger: 'operator', mode: 'dry-run' }, () => NOW);
    expect(runs.deleteStartedBefore).not.toHaveBeenCalled();

    await runner.run('orphan_recordings', { trigger: 'nightly' }, () => NOW);
    expect(runs.deleteStartedBefore).toHaveBeenCalledWith(new Date(NOW.getTime() - 90 * DAY_MS));
  });

  it('writes the error of a sweep that throws and throws it on', async () => {
    const { runner, sweeps, runs } = setup();
    sweeps.orphanContent.run.mockRejectedValue(new Error('db gone'));

    await expect(runner.run('orphan_content', { trigger: 'nightly' }, () => NOW)).rejects.toThrow('db gone');

    expect(runs.finish).toHaveBeenCalledWith('run-1', { report: null, error: 'db gone', finishedAt: NOW });
    expect(runs.deleteStartedBefore).not.toHaveBeenCalled();
  });

  it('still sweeps when the history cannot be written', async () => {
    const { runner, sweeps, runs } = setup();
    runs.start.mockRejectedValue(new Error('no table'));

    const out = await runner.run('orphan_recordings', { trigger: 'operator', mode: 'dry-run' }, () => NOW);

    expect(sweeps.orphanRecordings.run).toHaveBeenCalled();
    expect(runs.finish).not.toHaveBeenCalled();
    expect(out).toEqual({ mode: 'dry-run', scanned: 1 });
  });

  it('answers with the report even when its end cannot be written', async () => {
    const { runner, runs } = setup();
    runs.finish.mockRejectedValue(new Error('db gone'));

    await expect(runner.run('abandoned_uploads', { trigger: 'operator', mode: 'dry-run' }, () => NOW)).resolves.toEqual({
      mode: 'dry-run',
      scanned: 3,
    });
  });

  it('does not fail a nightly run when pruning fails', async () => {
    const { runner, runs } = setup();
    runs.deleteStartedBefore.mockRejectedValue(new Error('locked'));

    await expect(runner.run('orphan_recordings', { trigger: 'nightly' }, () => NOW)).resolves.toBeDefined();
  });
});
