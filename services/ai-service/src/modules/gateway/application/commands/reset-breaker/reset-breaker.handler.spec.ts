import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { AdminActor, AdminAuditEntry, IAdminAuditRecorder } from '../../../../../shared/application/admin-audit.js';
import type { BreakerBoard, BreakerRow } from '../../breaker-board.js';
import { BreakerStoreUnavailableError, type IBreakerInspector } from '../../ports/breaker-inspector.port.js';
import { ResetBreakerCommand } from './reset-breaker.command.js';
import { ResetBreakerHandler } from './reset-breaker.handler.js';

const admin: AdminActor = { userId: 'u1', level: 'admin' };

function row(state: Partial<BreakerRow>): BreakerRow {
  return {
    modelId: 'm1',
    providerModelId: 'claude-sonnet-5-5',
    displayName: 'Claude Sonnet 5.5',
    modality: 'llm',
    status: 'active',
    provider: { id: 'p1', code: 'anthropic', displayName: 'Anthropic', enabled: true },
    reopensAt: null,
    bindings: [],
    state: 'closed',
    reopensInMs: null,
    recentFailures: 0,
    ...state,
  } as BreakerRow;
}

function setup(options: { rows?: BreakerRow[][]; resetFails?: boolean; trailFails?: boolean } = {}) {
  const reads = [...(options.rows ?? [[row({ state: 'open', reopensInMs: 15_000, recentFailures: 0 })], [row({})]])];
  const resets: string[] = [];
  const trail: AdminAuditEntry[] = [];
  const board = { rows: async () => reads.shift() ?? [] } as unknown as BreakerBoard;
  const breakers = {
    reset: async (id: string) => {
      if (options.resetFails) throw new BreakerStoreUnavailableError();
      resets.push(id);
    },
  } as unknown as IBreakerInspector;
  const recorder: IAdminAuditRecorder = {
    record: async (entry) => {
      if (options.trailFails) throw new Error('db down');
      trail.push(entry);
    },
  };
  const handler = new ResetBreakerHandler(board, breakers, recorder);
  jest.spyOn((handler as unknown as { logger: { error: () => void } }).logger, 'error').mockImplementation(() => undefined);
  return { handler, resets, trail };
}

describe('ResetBreakerHandler', () => {
  it('closes an open breaker, puts it on the trail, and answers the row after', async () => {
    const { handler, resets, trail } = setup();
    const result = await handler.execute(new ResetBreakerCommand('m1', admin, '  Anthropic is back  '));
    expect(resets).toEqual(['m1']);
    expect(result).toMatchObject({ modelId: 'm1', state: 'closed', changed: true });
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({
      actor: admin,
      action: 'breaker.reset',
      targetType: 'model',
      targetId: 'm1',
      reason: 'Anthropic is back',
      before: { providerCode: 'anthropic', providerModelId: 'claude-sonnet-5-5', state: 'open', reopensInMs: 15_000, recentFailures: 0 },
      after: { providerCode: 'anthropic', providerModelId: 'claude-sonnet-5-5', state: 'closed', recentFailures: 0 },
    });
  });

  it('also clears a closed breaker with failures counted', async () => {
    const { handler, resets, trail } = setup({ rows: [[row({ recentFailures: 3 })], [row({})]] });
    await expect(handler.execute(new ResetBreakerCommand('m1', admin, 'x'))).resolves.toMatchObject({ changed: true });
    expect(resets).toEqual(['m1']);
    expect(trail[0]!.before).toMatchObject({ state: 'closed', recentFailures: 3 });
  });

  it('leaves a clean breaker alone: changed false, no reset, nothing on the trail', async () => {
    const { handler, resets, trail } = setup({ rows: [[row({})]] });
    await expect(handler.execute(new ResetBreakerCommand('m1', admin, 'x'))).resolves.toMatchObject({ changed: false });
    expect(resets).toEqual([]);
    expect(trail).toEqual([]);
  });

  it('is 404 for an unknown model', async () => {
    const { handler } = setup({ rows: [[]] });
    await expect(handler.execute(new ResetBreakerCommand('nope', admin, 'x'))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is 503 when the state cannot be read or the reset cannot be written, with nothing on the trail', async () => {
    const unread = setup({ rows: [[row({ state: 'unknown', recentFailures: null } as Partial<BreakerRow>)]] });
    await expect(unread.handler.execute(new ResetBreakerCommand('m1', admin, 'x'))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(unread.trail).toEqual([]);
    const unwritable = setup({ resetFails: true });
    await expect(unwritable.handler.execute(new ResetBreakerCommand('m1', admin, 'x'))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(unwritable.trail).toEqual([]);
  });

  it('fails loudly when the trail cannot be written after the reset', async () => {
    const { handler, resets } = setup({ trailFails: true });
    await expect(handler.execute(new ResetBreakerCommand('m1', admin, 'x'))).rejects.toThrow('db down');
    expect(resets).toEqual(['m1']);
  });
});
