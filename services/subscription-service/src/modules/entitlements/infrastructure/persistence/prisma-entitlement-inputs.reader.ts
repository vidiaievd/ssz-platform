import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { audienceFor, type BillingAccountType } from '../../../accounts/domain/billing-account.js';
import { toGrantProps } from '../../../accounts/infrastructure/persistence/account.mapper.js';
import { isCurrent } from '../../../accounts/domain/subscription.js';
import { toFeature, versionWithFeatures } from '../../../plans/infrastructure/persistence/plan.mapper.js';
import type { IEntitlementInputsReader } from '../../application/ports/entitlement-inputs.reader.js';
import { FREE_PLAN_CODES, type EntitlementInputs, type ResolvablePlan } from '../../domain/entitlements.js';

type Db = Prisma.TransactionClient;

@Injectable()
export class PrismaEntitlementInputsReader implements IEntitlementInputsReader {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One repeatable-read transaction: the revision and the rows it versions are read as of
   * the same moment, so a published snapshot never pairs new rows with an old version.
   */
  async load(type: BillingAccountType, externalId: string, now: Date): Promise<EntitlementInputs> {
    return this.prisma.$transaction((tx) => this.read(tx, type, externalId, now), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }

  private async read(db: Db, type: BillingAccountType, externalId: string, now: Date): Promise<EntitlementInputs> {
    const row = await db.billingAccount.findUnique({
      where: { type_externalId: { type, externalId } },
      include: {
        subscriptions: {
          where: { status: { in: ['trial', 'active'] } },
          include: { plan: { select: { code: true, name: true } }, version: versionWithFeatures },
        },
        // Scheduled ones too: the resolver needs their start for `validUntil`.
        grants: { where: { revokedAt: null, endsAt: { gt: now } } },
      },
    });

    const current = row?.subscriptions.find((s) => isCurrent(s, now));
    const subscription = current
      ? {
          id: current.id,
          status: current.status,
          periodStart: current.periodStart,
          periodEnd: current.periodEnd,
          plan: {
            code: current.plan.code,
            name: current.plan.name,
            version: current.planVersion,
            features: current.version.features.map(toFeature),
          },
        }
      : null;

    return {
      account: { type, externalId, revision: row?.revision ?? 0 },
      subscription,
      // Only read when needed: an account on a paid plan never looks at the free one.
      freePlan: subscription ? null : await this.freePlan(db, type),
      grants: (row?.grants ?? []).map(toGrantProps),
      now,
    };
  }

  private async freePlan(db: Db, type: BillingAccountType): Promise<ResolvablePlan | null> {
    const plan = await db.plan.findUnique({ where: { code: FREE_PLAN_CODES[audienceFor(type)] } });
    if (!plan) return null;
    const version = await db.planVersion.findUnique({
      where: { planId_version: { planId: plan.id, version: plan.currentVersion } },
      ...versionWithFeatures,
    });
    if (!version) return null;
    return { code: plan.code, name: plan.name, version: version.version, features: version.features.map(toFeature) };
  }
}
