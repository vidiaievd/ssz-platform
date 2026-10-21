import type { Prisma, PlanFeature as PrismaFeature } from '../../../../../generated/prisma/client.js';
import { Plan, type PlanFeature, type PlanVersion } from '../../domain/plan.js';

export const versionWithFeatures = { include: { features: { orderBy: { featureKey: 'asc' } } } } as const;

type VersionRow = Prisma.PlanVersionGetPayload<typeof versionWithFeatures>;
type PlanRow = Prisma.PlanGetPayload<{ include: { versions: typeof versionWithFeatures } }>;

export function toFeature(row: Pick<PrismaFeature, 'featureKey' | 'enabled' | 'monthlyCredits' | 'limits'>): PlanFeature {
  return {
    featureKey: row.featureKey,
    enabled: row.enabled,
    monthlyCredits: row.monthlyCredits?.toString() ?? null,
    limits: (row.limits ?? {}) as Record<string, number>,
  };
}

export function toVersion(row: VersionRow): PlanVersion {
  return { version: row.version, features: row.features.map(toFeature), createdBy: row.createdBy, createdAt: row.createdAt };
}

/** `row.versions` must hold the current version (the repository loads only that one). */
export function toPlan(row: PlanRow): Plan {
  const current = row.versions.find((v) => v.version === row.currentVersion);
  if (!current) throw new Error(`Plan ${row.code} has no row for its current version ${row.currentVersion}`);
  return Plan.restore({
    id: row.id,
    code: row.code,
    name: row.name,
    audience: row.audience,
    status: row.status,
    current: toVersion(current),
  });
}

export function featureRows(features: readonly PlanFeature[]): Prisma.PlanFeatureCreateWithoutPlanVersionInput[] {
  return features.map((f) => ({
    featureKey: f.featureKey,
    enabled: f.enabled,
    monthlyCredits: f.monthlyCredits,
    limits: f.limits as Prisma.InputJsonValue,
  }));
}
