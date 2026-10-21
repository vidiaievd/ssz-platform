import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { audienceFor, type BillingAccountType } from '../../../accounts/domain/billing-account.js';
import { toGrantProps } from '../../../accounts/infrastructure/persistence/account.mapper.js';
import { isCurrent } from '../../../accounts/domain/subscription.js';
import { toFeature, versionWithFeatures } from '../../../plans/infrastructure/persistence/plan.mapper.js';
import type { IEntitlementInputsReader } from '../../application/ports/entitlement-inputs.reader.js';
import { FREE_PLAN_CODES, type EntitlementInputs, type ResolvablePlan } from '../../domain/entitlements.js';

@Injectable()
export class PrismaEntitlementInputsReader implements IEntitlementInputsReader {
  constructor(private readonly prisma: PrismaService) {}

  async load(type: BillingAccountType, externalId: string, now: Date): Promise<EntitlementInputs> {
    const row = await this.prisma.billingAccount.findUnique({
      where: { type_externalId: { type, externalId } },
      include: {
        subscriptions: {
          where: { status: { in: ['trial', 'active'] } },
          include: { plan: { select: { code: true, name: true } }, version: versionWithFeatures },
        },
        grants: { where: { revokedAt: null, startsAt: { lte: now }, endsAt: { gt: now } } },
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
      freePlan: subscription ? null : await this.freePlan(type),
      grants: (row?.grants ?? []).map(toGrantProps),
      now,
    };
  }

  private async freePlan(type: BillingAccountType): Promise<ResolvablePlan | null> {
    const plan = await this.prisma.plan.findUnique({ where: { code: FREE_PLAN_CODES[audienceFor(type)] } });
    if (!plan) return null;
    const version = await this.prisma.planVersion.findUnique({
      where: { planId_version: { planId: plan.id, version: plan.currentVersion } },
      ...versionWithFeatures,
    });
    if (!version) return null;
    return { code: plan.code, name: plan.name, version: version.version, features: version.features.map(toFeature) };
  }
}
