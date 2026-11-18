import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import {
  SWEEP_KINDS,
  SWEEP_MODES,
  SWEEP_TRIGGERS,
  type SweepKind,
  type SweepRunMode,
  type SweepRunRecord,
  type SweepTrigger,
} from '../domain/sweep-run.js';
import type {
  FinishSweepRun,
  ISweepRunRepository,
  StartSweepRun,
} from '../domain/sweep-run.repository.interface.js';

interface SweepRunRow {
  id: string;
  kind: string;
  mode: string;
  trigger: string;
  actorId: string | null;
  report: unknown;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

function oneOf<T extends string>(allowed: readonly T[], value: string, column: string): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`sweep_runs.${column} holds an unknown value "${value}"`);
}

export function toSweepRunRecord(row: SweepRunRow): SweepRunRecord {
  const report =
    row.report !== null && typeof row.report === 'object' && !Array.isArray(row.report)
      ? (row.report as Record<string, unknown>)
      : null;
  return {
    id: row.id,
    kind: oneOf<SweepKind>(SWEEP_KINDS, row.kind, 'kind'),
    mode: oneOf<SweepRunMode>(SWEEP_MODES, row.mode, 'mode'),
    trigger: oneOf<SweepTrigger>(SWEEP_TRIGGERS, row.trigger, 'trigger'),
    actorId: row.actorId,
    report,
    error: row.error,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

@Injectable()
export class PrismaSweepRunRepository implements ISweepRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  async start(run: StartSweepRun): Promise<string> {
    const row = await this.prisma.sweepRun.create({
      data: {
        kind: run.kind,
        mode: run.mode,
        trigger: run.trigger,
        actorId: run.actorId,
        startedAt: run.startedAt,
      },
      select: { id: true },
    });
    return row.id;
  }

  async finish(id: string, end: FinishSweepRun): Promise<void> {
    await this.prisma.sweepRun.update({
      where: { id },
      data: {
        // Prisma takes JSON as an input object; a report is plain numbers and booleans.
        report: end.report === null ? undefined : (end.report as object),
        error: end.error,
        finishedAt: end.finishedAt,
      },
    });
  }

  async recentByKind(limit: number): Promise<Record<SweepKind, SweepRunRecord[]>> {
    // Four small indexed reads (kind, started_at) — simpler than a window query, same cost.
    const lists = await Promise.all(
      SWEEP_KINDS.map((kind) =>
        this.prisma.sweepRun.findMany({
          where: { kind },
          orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
          take: limit,
        }),
      ),
    );
    const result = {} as Record<SweepKind, SweepRunRecord[]>;
    SWEEP_KINDS.forEach((kind, index) => {
      result[kind] = lists[index]!.map((row) => toSweepRunRecord(row));
    });
    return result;
  }

  async deleteStartedBefore(before: Date): Promise<number> {
    const { count } = await this.prisma.sweepRun.deleteMany({ where: { startedAt: { lt: before } } });
    return count;
  }
}
