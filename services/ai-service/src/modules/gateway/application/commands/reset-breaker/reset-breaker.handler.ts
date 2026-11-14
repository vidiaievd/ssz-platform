import { Inject, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  ADMIN_AUDIT_RECORDER,
  adminAuditEntry,
  type IAdminAuditRecorder,
} from '../../../../../shared/application/admin-audit.js';
import { BreakerBoard, type BreakerRow } from '../../breaker-board.js';
import {
  BREAKER_INSPECTOR,
  BreakerStoreUnavailableError,
  type IBreakerInspector,
} from '../../ports/breaker-inspector.port.js';
import { ResetBreakerCommand } from './reset-breaker.command.js';

/** The model's row after the reset, plus whether there was anything to reset. */
export type ResetBreakerResult = BreakerRow & {
  /** False when the breaker was closed with no failures counted: nothing done, nothing on the trail. */
  changed: boolean;
};

/**
 * Closes one model's breaker by hand (plan 90, phase 7, step 8) — after the provider is back, so
 * the router stops sending its calls to the fallback before the breaker would have let go itself.
 *
 * The breaker lives in Redis and the trail in the database, so they cannot commit together: the
 * reset goes first (it is the action), the trail entry right after. A store that cannot be read
 * or written is a 503 — never a reset reported as done.
 */
@CommandHandler(ResetBreakerCommand)
export class ResetBreakerHandler implements ICommandHandler<ResetBreakerCommand, ResetBreakerResult> {
  private readonly logger = new Logger(ResetBreakerHandler.name);

  constructor(
    private readonly board: BreakerBoard,
    @Inject(BREAKER_INSPECTOR) private readonly breakers: IBreakerInspector,
    @Inject(ADMIN_AUDIT_RECORDER) private readonly trail: IAdminAuditRecorder,
  ) {}

  async execute(command: ResetBreakerCommand): Promise<ResetBreakerResult> {
    const [before] = await this.board.rows(command.modelId);
    if (!before) throw new NotFoundException(`Model ${command.modelId} not found`);
    if (before.state === 'unknown') throw new ServiceUnavailableException('breaker_store_unavailable');
    if (before.state === 'closed' && before.recentFailures === 0) return { ...before, changed: false };

    try {
      await this.breakers.reset(command.modelId);
    } catch (err) {
      if (err instanceof BreakerStoreUnavailableError) throw new ServiceUnavailableException('breaker_store_unavailable');
      throw err;
    }

    const ids = { providerCode: before.provider.code, providerModelId: before.providerModelId };
    const entry = adminAuditEntry({
      actor: command.admin,
      action: 'breaker.reset',
      targetType: 'model',
      targetId: command.modelId,
      reason: command.reason,
      before: { ...ids, state: before.state, reopensInMs: before.reopensInMs, recentFailures: before.recentFailures },
      after: { ...ids, state: 'closed', recentFailures: 0 },
      now: new Date(),
    });
    try {
      await this.trail.record(entry);
    } catch (err) {
      // The breaker is already closed; say so loudly rather than pretend the reset did not happen.
      this.logger.error(`Breaker of model ${command.modelId} was reset but the trail entry failed: ${(err as Error).message}`);
      throw err;
    }

    const [after] = await this.board.rows(command.modelId);
    return { ...(after ?? before), changed: true };
  }
}
