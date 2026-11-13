// Seeds the plan map from prisma/seed-data/plans.json (plan 78, step 2).
//
// Idempotent and conservative, because after the first run the admin owns these rows:
//  - a missing plan is created at version 1, after the same domain checks the admin API runs;
//  - an existing plan is never changed: a name, status or feature list that disagrees with
//    the file is reported, not applied — changing features is a new version through the API;
//  - nothing absent from the file is deleted.
//
// SEED_REVISE=1 opts in to one exception: a plan whose current features differ from the file gets
// the file's features as a NEW version (name, audience and status are still only reported). It is
// how a catalogue change made in code reaches a running database (plan 90, phase 4: seat limits)
// without an admin token. Subscribers stay on their version; the free plans' current version is
// what payers without a subscription read, so they get it at once. No admin_audit row is written —
// the version's `created_by` is `seed`.
//
// Run: npx prisma db seed   (inside the container: docker compose ... exec subscription-service npx prisma db seed)
//      SEED_REVISE=1 npx prisma db seed
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { Plan, type PlanAudience, type PlanFeature } from '../src/modules/plans/domain/plan.js';
import { describePlanError } from '../src/modules/plans/domain/plan-errors.js';

interface SeedPlan {
  code: string;
  name: string;
  audience: PlanAudience;
  features: PlanFeature[];
}

const SEED_AUTHOR = 'seed';
const REVISE = process.env['SEED_REVISE'] === '1';

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, 'seed-data/plans.json'), 'utf8')) as { plans: SeedPlan[] };

const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

type StoredFeature = { featureKey: string; enabled: boolean; monthlyCredits: Prisma.Decimal | null; limits: unknown };

function sameFeatures(stored: StoredFeature[], wanted: PlanFeature[]): boolean {
  if (stored.length !== wanted.length) return false;
  const byKey = new Map(stored.map((f) => [f.featureKey, f]));
  return wanted.every((w) => {
    const s = byKey.get(w.featureKey);
    if (!s || s.enabled !== w.enabled) return false;
    const credits =
      s.monthlyCredits === null || w.monthlyCredits === null
        ? s.monthlyCredits === null && w.monthlyCredits === null
        : s.monthlyCredits.equals(new Prisma.Decimal(w.monthlyCredits));
    return credits && JSON.stringify(s.limits) === JSON.stringify(w.limits);
  });
}

async function main(): Promise<void> {
  for (const p of data.plans) {
    const checked = Plan.create({
      id: randomUUID(),
      code: p.code,
      name: p.name,
      audience: p.audience,
      features: p.features,
      createdBy: SEED_AUTHOR,
      now: new Date(),
    });
    if (checked.isFail) throw new Error(`plan ${p.code}: ${describePlanError(checked.error)}`);
    const plan = checked.value;

    const existing = await prisma.plan.findUnique({
      where: { code: plan.code },
      include: { versions: { include: { features: true } } },
    });

    if (!existing) {
      await prisma.plan.create({
        data: {
          id: plan.id,
          code: plan.code,
          name: plan.name,
          audience: plan.audience,
          status: plan.status,
          currentVersion: plan.current.version,
          versions: {
            create: {
              version: plan.current.version,
              createdBy: SEED_AUTHOR,
              features: {
                create: plan.current.features.map((f) => ({
                  featureKey: f.featureKey,
                  enabled: f.enabled,
                  monthlyCredits: f.monthlyCredits,
                  limits: f.limits as Prisma.InputJsonValue,
                })),
              },
            },
          },
        },
      });
      console.log(`plan ${plan.code} created at v1 (${plan.current.features.length} features)`);
      continue;
    }

    const current = existing.versions.find((v) => v.version === existing.currentVersion);
    const drift: string[] = [];
    if (existing.name !== plan.name) drift.push('name');
    if (existing.audience !== plan.audience) drift.push('audience');
    const featuresDrift = !current || !sameFeatures(current.features, plan.current.features);
    if (featuresDrift && REVISE && existing.status === 'active' && existing.audience === plan.audience) {
      const next = existing.currentVersion + 1;
      // Same optimistic guard as the admin API: the plan row moves only from the version read.
      await prisma.$transaction(async (tx) => {
        const moved = await tx.plan.updateMany({
          where: { id: existing.id, currentVersion: existing.currentVersion },
          data: { currentVersion: next },
        });
        if (moved.count !== 1) throw new Error(`plan ${plan.code} changed while seeding — run again`);
        await tx.planVersion.create({
          data: {
            planId: existing.id,
            version: next,
            createdBy: SEED_AUTHOR,
            features: {
              create: plan.current.features.map((f) => ({
                featureKey: f.featureKey,
                enabled: f.enabled,
                monthlyCredits: f.monthlyCredits,
                limits: f.limits as Prisma.InputJsonValue,
              })),
            },
          },
        });
      });
      console.log(`plan ${plan.code} revised from the file: v${existing.currentVersion} → v${next}`);
      if (drift.length === 0) continue;
    } else if (featuresDrift) {
      drift.push('features');
    }
    if (drift.length > 0) {
      console.warn(
        `plan ${plan.code} (v${existing.currentVersion}, ${existing.status}) differs from the file in ` +
          `${drift.join(', ')} — left as stored; change it through the admin API`,
      );
    } else {
      console.log(`plan ${plan.code} up to date (v${existing.currentVersion}, ${existing.status})`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
