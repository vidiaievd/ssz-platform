import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../generated/prisma/client.js';
import type { AiBinding as PrismaBinding, AiBindingChange as PrismaChange } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { Result } from '../../../../shared/kernel/result.js';
import type { IBindingRepository } from '../../application/ports/binding.repository.js';
import { settingsOf, type AiBinding, type BindingChange, type BindingSettings } from '../../domain/binding.js';

class VersionConflict extends Error {}

@Injectable()
export class PrismaBindingRepository implements IBindingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async get(capability: string): Promise<AiBinding | null> {
    const row = await this.prisma.aiBinding.findUnique({ where: { capability } });
    return row ? toBinding(row) : null;
  }

  async list(): Promise<AiBinding[]> {
    const rows = await this.prisma.aiBinding.findMany({ orderBy: { capability: 'asc' } });
    return rows.map(toBinding);
  }

  async save(
    capability: string,
    settings: BindingSettings,
    expectedVersion: number | undefined,
    changedBy: string,
  ): Promise<Result<AiBinding, 'version_conflict'>> {
    try {
      const saved = await this.prisma.$transaction(async (tx) => {
        const current = await tx.aiBinding.findUnique({ where: { capability } });
        if (expectedVersion !== undefined && (current?.version ?? 0) !== expectedVersion) {
          throw new VersionConflict();
        }
        const version = (current?.version ?? 0) + 1;
        const row = current
          ? await tx.aiBinding.update({ where: { capability }, data: { ...settings, version, updatedBy: changedBy } })
          : await tx.aiBinding.create({ data: { capability, ...settings, version, updatedBy: changedBy } });
        await tx.aiBindingChange.create({
          data: {
            capability,
            version,
            changedBy,
            before: current ? (settingsOf(toBinding(current)) as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
            after: settings as unknown as Prisma.InputJsonValue,
          },
        });
        return row;
      });
      return Result.ok(toBinding(saved));
    } catch (err) {
      if (err instanceof VersionConflict) return Result.fail('version_conflict');
      // Two writers raced past the version check: the (capability, version) history key, or
      // the capability key on a double create, lets exactly one of them through.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return Result.fail('version_conflict');
      }
      throw err;
    }
  }

  async history(capability: string): Promise<BindingChange[]> {
    const rows = await this.prisma.aiBindingChange.findMany({
      where: { capability },
      orderBy: { version: 'desc' },
    });
    return rows.map(toChange);
  }
}

function toBinding(row: PrismaBinding): AiBinding {
  return {
    capability: row.capability,
    primaryModelId: row.primaryModelId,
    fallbackModelId: row.fallbackModelId,
    maxOutputTokens: row.maxOutputTokens,
    temperature: row.temperature,
    timeoutMs: row.timeoutMs,
    promptVersion: row.promptVersion,
    enabled: row.enabled,
    version: row.version,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
  };
}

function toChange(row: PrismaChange): BindingChange {
  return {
    capability: row.capability,
    version: row.version,
    changedBy: row.changedBy,
    changedAt: row.changedAt,
    before: (row.before as unknown as BindingSettings | null) ?? null,
    after: row.after as unknown as BindingSettings,
  };
}
