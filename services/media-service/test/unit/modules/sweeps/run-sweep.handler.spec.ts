import { RunSweepCommand } from '../../../../src/modules/sweeps/application/commands/run-sweep/run-sweep.command.js';
import { RunSweepHandler } from '../../../../src/modules/sweeps/application/commands/run-sweep/run-sweep.handler.js';

const NOW = new Date('2026-11-14T18:00:00.000Z');
const SUPER = { userId: 'admin-s', level: 'super' as const };
const ADMIN = { userId: 'admin-a', level: 'admin' as const };

const REPORT = { mode: 'delete', scanned: 10, inUse: 7, orphans: 3, deleted: 3, aborted: false, skipped: false };

function setup() {
  const runner = { tryRun: jest.fn().mockResolvedValue({ runId: 'run-1', report: REPORT }) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const handler = new RunSweepHandler(runner as never, audit as never);
  const exec = (command: RunSweepCommand) => handler.execute(command, () => NOW);
  return { runner, audit, exec };
}

describe('RunSweepHandler (plan 90, phase 8, step 4)', () => {
  it('runs a dry run for an admin, as an admin run with the actor, and journals nothing', async () => {
    const { runner, audit, exec } = setup();
    runner.tryRun.mockResolvedValue({
      runId: 'run-2',
      report: { mode: 'dry-run', scanned: 4, inUse: 1, orphans: 3, deleted: 0, aborted: false, skipped: false },
    });

    const result = await exec(new RunSweepCommand('orphan_recordings', true, undefined, ADMIN));

    expect(runner.tryRun).toHaveBeenCalledWith(
      'orphan_recordings',
      { trigger: 'admin', mode: 'dry-run', actorId: 'admin-a' },
      expect.any(Function),
    );
    expect(result.isOk).toBe(true);
    expect(result.value).toMatchObject({
      runId: 'run-2',
      kind: 'orphan_recordings',
      mode: 'dry-run',
      summary: { scanned: 4, kept: 1, candidates: 3, deleted: 0, aborted: false, skipped: false },
    });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('refuses to delete below super, before anything runs', async () => {
    const { runner, exec } = setup();

    const result = await exec(new RunSweepCommand('orphan_content', false, 'bucket full', ADMIN));

    expect(result.isFail).toBe(true);
    expect(result.error).toEqual({ code: 'ADMIN_LEVEL_REQUIRED', requiredLevel: 'super' });
    expect(runner.tryRun).not.toHaveBeenCalled();
  });

  it.each([undefined, '', '   '])('refuses to delete without a reason (%p)', async (reason) => {
    const { runner, exec } = setup();

    const result = await exec(new RunSweepCommand('orphan_content', false, reason, SUPER));

    expect(result.error).toEqual({ code: 'REASON_REQUIRED' });
    expect(runner.tryRun).not.toHaveBeenCalled();
  });

  it('deletes for super and puts the run on the trail with its report and run id', async () => {
    const { runner, audit, exec } = setup();

    const result = await exec(new RunSweepCommand('orphan_recordings', false, '  bucket at 92 %  ', SUPER));

    expect(runner.tryRun).toHaveBeenCalledWith(
      'orphan_recordings',
      { trigger: 'admin', mode: 'delete', actorId: 'admin-s' },
      expect.any(Function),
    );
    expect(result.value.summary.deleted).toBe(3);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0][0]).toMatchObject({
      occurredAt: NOW,
      actor: SUPER,
      action: 'media.sweep.deleted',
      targetType: 'media_sweep',
      targetId: 'orphan_recordings',
      reason: 'bucket at 92 %',
      before: null,
      after: { runId: 'run-1', ...REPORT },
    });
  });

  it('answers SWEEP_RUNNING when the kind is busy, and journals nothing', async () => {
    const { runner, audit, exec } = setup();
    runner.tryRun.mockResolvedValue(null);

    const result = await exec(new RunSweepCommand('abandoned_uploads', false, 'why', SUPER));

    expect(result.error).toEqual({ code: 'SWEEP_RUNNING' });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('treats a run the sweep itself skipped as busy', async () => {
    const { runner, audit, exec } = setup();
    runner.tryRun.mockResolvedValue({ runId: 'run-3', report: { mode: 'delete', scanned: 0, deleted: 0, skipped: true } });

    const result = await exec(new RunSweepCommand('abandoned_uploads', false, 'why', SUPER));

    expect(result.error).toEqual({ code: 'SWEEP_RUNNING' });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('journals a delete run that threw — files may be gone — and throws on', async () => {
    const { runner, audit, exec } = setup();
    runner.tryRun.mockRejectedValue(new Error('minio gone'));

    await expect(exec(new RunSweepCommand('superseded_narrations', false, 'why', SUPER))).rejects.toThrow('minio gone');

    expect(audit.record.mock.calls[0][0]).toMatchObject({
      targetId: 'superseded_narrations',
      after: { error: 'minio gone' },
    });
  });

  it('does not journal a dry run that threw', async () => {
    const { runner, audit, exec } = setup();
    runner.tryRun.mockRejectedValue(new Error('db gone'));

    await expect(exec(new RunSweepCommand('orphan_content', true, undefined, ADMIN))).rejects.toThrow('db gone');
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('still answers the delete when the trail cannot be written', async () => {
    const { audit, exec } = setup();
    audit.record.mockRejectedValue(new Error('outbox locked'));

    const result = await exec(new RunSweepCommand('orphan_recordings', false, 'why', SUPER));

    expect(result.isOk).toBe(true);
    expect(result.value.summary.deleted).toBe(3);
  });
});
