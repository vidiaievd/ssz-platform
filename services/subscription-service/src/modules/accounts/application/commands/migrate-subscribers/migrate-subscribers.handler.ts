import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { businessError } from '../../../../../common/errors/business-error.js';
import { adminAuditEntry } from '../../../../../shared/application/admin-audit.js';
import { loadPlanOr404 } from '../../../../plans/application/load-plan.js';
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../../plans/application/ports/plan.repository.js';
import { diffPlanFeatures, type FeatureChange } from '../../../../plans/domain/plan-diff.js';
import { describeAccountError, type AccountError } from '../../../domain/account-errors.js';
import { accountTarget, subscriptionSnapshot } from '../../audit-snapshots.js';
import { BILLING_ACCOUNT_REPOSITORY, type IBillingAccountRepository } from '../../ports/billing-account.repository.js';
import {
  SUBSCRIBER_MIGRATION_READER,
  type ISubscriberMigrationReader,
  type MigrationScope,
} from '../../ports/subscriber-migration.reader.js';
import { MigrateSubscribersCommand } from './migrate-subscribers.command.js';

/** Accounts moved per call; the panel calls again while `remaining > 0`. */
export const MIGRATION_BATCH_SIZE = 200;

export interface MigrationSource {
  version: number;
  subscribers: number;
  /** What these subscribers gain and lose by the move. */
  changes: FeatureChange[];
}

export interface MigrationPreview {
  dryRun: true;
  planCode: string;
  toVersion: number;
  total: number;
  sources: MigrationSource[];
}

export interface MigrationBatch {
  dryRun: false;
  planCode: string;
  toVersion: number;
  batchId: string;
  moved: number;
  /** In scope when picked but changed meanwhile (moved by someone else, revision conflict). */
  skipped: number;
  remaining: number;
}

/**
 * Moves the current subscribers of a plan's older versions to its current version (plan 90,
 * phase 8, step 6). Each account is its own transaction with its own trail row and a revision
 * bump, which is what sends its `entitlements.changed` snapshot. Grants are left alone; a seat
 * limit below the roster evicts nobody (phase 4).
 */
@CommandHandler(MigrateSubscribersCommand)
export class MigrateSubscribersHandler
  implements ICommandHandler<MigrateSubscribersCommand, MigrationPreview | MigrationBatch>
{
  private readonly logger = new Logger(MigrateSubscribersHandler.name);

  constructor(
    @Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(BILLING_ACCOUNT_REPOSITORY) private readonly accounts: IBillingAccountRepository,
    @Inject(SUBSCRIBER_MIGRATION_READER) private readonly reader: ISubscriberMigrationReader,
  ) {}

  async execute(command: MigrateSubscribersCommand): Promise<MigrationPreview | MigrationBatch> {
    const plan = await loadPlanOr404(this.plans, command.planCode);
    const target = plan.versionForAssignment();
    if (target.isFail) throw refusal(target.error);
    const toVersion = target.value.version;
    if (command.toVersion !== toVersion) {
      throw refusal({ code: 'migration_target_not_current', planCode: plan.code, currentVersion: toVersion, toVersion: command.toVersion });
    }
    const fromVersions = command.fromVersions === null ? null : [...new Set(command.fromVersions)].sort((a, b) => a - b);
    if (fromVersions && (fromVersions.length === 0 || fromVersions.some((v) => v < 1 || v >= toVersion))) {
      throw refusal({ code: 'invalid_source_versions', toVersion, versions: fromVersions });
    }

    const now = new Date();
    const scope: MigrationScope = { planId: plan.id, toVersion, fromVersions, now };
    if (command.dryRun) return this.preview(plan.code, toVersion, scope);

    const reason = command.reason?.trim();
    if (!reason) throw new BadRequestException('reason is required to move subscribers');
    const batchId = command.batchId ?? randomUUID();

    let moved = 0;
    let skipped = 0;
    for (const payer of await this.reader.accountsToMove(scope, MIGRATION_BATCH_SIZE)) {
      const account = await this.accounts.find(payer.type, payer.externalId);
      const step = account?.moveToCurrentVersion(plan, {
        subscriptionId: randomUUID(),
        fromVersions,
        by: command.actor.userId,
        now,
      });
      if (!account || !step || step.isFail) {
        skipped += 1;
        continue;
      }
      const audit = adminAuditEntry({
        actor: command.actor,
        action: 'subscription.migrated',
        ...accountTarget(payer.type, payer.externalId),
        reason,
        before: subscriptionSnapshot(step.value.before),
        after: { ...subscriptionSnapshot(step.value.after), batchId },
        now,
      });
      const saved = await this.accounts.save(account, audit);
      if (saved.isFail) {
        skipped += 1;
        continue;
      }
      moved += 1;
    }

    const remaining = (await this.reader.countByVersion(scope)).reduce((sum, v) => sum + v.subscribers, 0);
    this.logger.log(`Plan ${plan.code} → v${toVersion}, batch ${batchId}: moved ${moved}, skipped ${skipped}, remaining ${remaining}`);
    return { dryRun: false, planCode: plan.code, toVersion, batchId, moved, skipped, remaining };
  }

  private async preview(planCode: string, toVersion: number, scope: MigrationScope): Promise<MigrationPreview> {
    const [counts, versions] = await Promise.all([this.reader.countByVersion(scope), this.plans.versions(planCode)]);
    const byNumber = new Map(versions.map((v) => [v.version, v]));
    const target = byNumber.get(toVersion)!;
    const sources = counts.map(({ version, subscribers }) => ({
      version,
      subscribers,
      changes: diffPlanFeatures(byNumber.get(version)?.features ?? [], target.features),
    }));
    return { dryRun: true, planCode, toVersion, total: sources.reduce((sum, s) => sum + s.subscribers, 0), sources };
  }
}

function refusal(error: AccountError) {
  return businessError(error, describeAccountError(error));
}
