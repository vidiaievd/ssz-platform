import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { AdminLevel, adminLevelAtLeast } from '@ssz/contracts';
import { Result } from '../../../../../shared/kernel/result.js';
import {
  ADMIN_AUDIT_RECORDER,
  adminAuditEntry,
  type IAdminAuditRecorder,
} from '../../../../../shared/application/admin-audit.js';
import type { RunSweepError } from '../../../domain/run-sweep.errors.js';
import { summarizeSweepReport, type SweepRunMode } from '../../../domain/sweep-run.js';
import { SweepRunner } from '../../sweep-runner.js';
import { RunSweepCommand, type RunSweepResult } from './run-sweep.command.js';

/**
 * Runs one media sweep for the admin panel, synchronously, like the operator's internal route.
 * A dry run (`admin`) leaves only its `sweep_runs` row. A delete run (`super`, reason required)
 * also goes on the trail — `admin_audit` + `admin.action.performed` through the outbox — after
 * the run, whether it finished or threw: files may be gone either way.
 */
@CommandHandler(RunSweepCommand)
export class RunSweepHandler implements ICommandHandler<RunSweepCommand, Result<RunSweepResult, RunSweepError>> {
  private readonly logger = new Logger(RunSweepHandler.name);

  constructor(
    private readonly runner: SweepRunner,
    @Inject(ADMIN_AUDIT_RECORDER) private readonly audit: IAdminAuditRecorder,
  ) {}

  async execute(command: RunSweepCommand, now: () => Date = () => new Date()): Promise<Result<RunSweepResult, RunSweepError>> {
    const mode: SweepRunMode = command.dryRun ? 'dry-run' : 'delete';
    const reason = command.reason?.trim() ?? '';

    if (mode === 'delete') {
      if (!adminLevelAtLeast(command.actor.level, AdminLevel.SUPER)) {
        return Result.fail({ code: 'ADMIN_LEVEL_REQUIRED', requiredLevel: 'super' });
      }
      if (!reason) return Result.fail({ code: 'REASON_REQUIRED' });
    }

    const request = { trigger: 'admin' as const, mode, actorId: command.actor.userId };
    let outcome;
    try {
      outcome = await this.runner.tryRun(command.kind, request, now);
    } catch (err) {
      if (mode === 'delete') {
        await this.putOnTrail(command, reason, { error: err instanceof Error ? err.message : String(err) }, now());
      }
      throw err;
    }
    if (!outcome) return Result.fail({ code: 'SWEEP_RUNNING' });

    const summary = summarizeSweepReport(command.kind, outcome.report as Record<string, unknown>)!;
    // Every start goes through the runner, so this should not happen; the sweep's own guard is the
    // last word, and a skipped run did nothing — not a delete to put on the trail.
    if (summary.skipped) return Result.fail({ code: 'SWEEP_RUNNING' });

    if (mode === 'delete') {
      await this.putOnTrail(command, reason, { runId: outcome.runId, ...outcome.report }, now());
    }

    return Result.ok({ runId: outcome.runId, kind: command.kind, mode, report: outcome.report, summary });
  }

  /**
   * The files are already gone when this runs, so a trail that cannot be written must not turn the
   * answer into an error the admin would retry — it is logged loudly instead.
   */
  private async putOnTrail(
    command: RunSweepCommand,
    reason: string,
    after: Record<string, unknown>,
    at: Date,
  ): Promise<void> {
    try {
      await this.audit.record(
        adminAuditEntry({
          actor: command.actor,
          action: 'media.sweep.deleted',
          targetType: 'media_sweep',
          targetId: command.kind,
          reason,
          after,
          now: at,
        }),
      );
    } catch (err) {
      this.logger.error(
        `could not put the ${command.kind} delete run by ${command.actor.userId} on the admin trail: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }
}
