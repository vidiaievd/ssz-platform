import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { Result } from '../../../../shared/kernel/result.js';
import type { IPlanRepository } from '../../application/ports/plan.repository.js';
import type { Plan, PlanVersion } from '../../domain/plan.js';
import { featureRows, toPlan, toVersion, versionWithFeatures } from './plan.mapper.js';

// The current version is always the newest: versions only ever go up.
const withCurrentVersion = { versions: { ...versionWithFeatures, orderBy: { version: 'desc' }, take: 1 } } as const;

class VersionConflict extends Error {}

@Injectable()
export class PrismaPlanRepository implements IPlanRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByCode(code: string): Promise<Plan | null> {
    const row = await this.prisma.plan.findUnique({ where: { code }, include: withCurrentVersion });
    return row ? toPlan(row) : null;
  }

  async list(): Promise<Plan[]> {
    const rows = await this.prisma.plan.findMany({ include: withCurrentVersion, orderBy: [{ audience: 'asc' }, { code: 'asc' }] });
    return rows.map(toPlan);
  }

  async versions(code: string): Promise<PlanVersion[]> {
    const rows = await this.prisma.planVersion.findMany({
      where: { plan: { code } },
      ...versionWithFeatures,
      orderBy: { version: 'desc' },
    });
    return rows.map(toVersion);
  }

  async create(plan: Plan): Promise<Result<void, 'code_taken'>> {
    try {
      await this.prisma.plan.create({
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
              createdBy: plan.current.createdBy,
              createdAt: plan.current.createdAt,
              features: { create: featureRows(plan.current.features) },
            },
          },
        },
      });
      return Result.ok();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return Result.fail('code_taken');
      throw err;
    }
  }

  async save(plan: Plan, baseVersion: number): Promise<Result<void, 'version_conflict'>> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.plan.updateMany({
          where: { id: plan.id, currentVersion: baseVersion },
          data: { name: plan.name, status: plan.status, currentVersion: plan.current.version },
        });
        if (updated.count === 0) throw new VersionConflict();
        if (plan.current.version > baseVersion) {
          await tx.planVersion.create({
            data: {
              planId: plan.id,
              version: plan.current.version,
              createdBy: plan.current.createdBy,
              createdAt: plan.current.createdAt,
              features: { create: featureRows(plan.current.features) },
            },
          });
        }
      });
      return Result.ok();
    } catch (err) {
      if (err instanceof VersionConflict) return Result.fail('version_conflict');
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return Result.fail('version_conflict');
      throw err;
    }
  }
}
