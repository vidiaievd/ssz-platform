import { Injectable } from '@nestjs/common';
import type { AiEvalRun as EvalRunRow } from '../../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import type { IEvalRunRepository } from '../application/ports/eval-run.repository.js';
import type { BindingAtStart, EvalRun, EvalRunFinish, EvalRunStatus } from '../domain/eval-run.js';
import type { CaseResult, RunScores } from '../domain/eval-score.js';

@Injectable()
export class PrismaEvalRunRepository implements IEvalRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(run: EvalRun): Promise<void> {
    await this.prisma.aiEvalRun.create({
      data: {
        id: run.id,
        capability: run.capability,
        modelId: run.modelId,
        promptVersion: run.promptVersion,
        status: run.status,
        startedBy: run.startedBy,
        // JSON columns take plain objects; Prisma's write type wants its own spelling of that.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        bindingAtStart: (run.bindingAtStart ?? undefined) as any,
        caseCount: run.caseCount,
        skipped: run.skipped,
        startedAt: run.startedAt,
      },
    });
  }

  async finish(id: string, finish: EvalRunFinish, at: Date): Promise<boolean> {
    const data =
      finish.status === 'done'
        ? {
            status: 'done',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            scores: finish.scores as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cases: finish.cases as any,
            costMicros: finish.cost ? BigInt(finish.cost.micros) : null,
            currency: finish.cost?.currency ?? null,
            credits: finish.credits,
            finishedAt: at,
          }
        : { status: 'failed', error: finish.error, finishedAt: at };
    const { count } = await this.prisma.aiEvalRun.updateMany({ where: { id, status: 'running' }, data });
    return count === 1;
  }

  async findById(id: string): Promise<EvalRun | null> {
    const row = await this.prisma.aiEvalRun.findUnique({ where: { id } });
    return row ? toRun(row) : null;
  }

  async list(capability: string, limit: number): Promise<EvalRun[]> {
    const rows = await this.prisma.aiEvalRun.findMany({
      where: { capability },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return rows.map(toRun);
  }

  async failRunning(error: string, at: Date): Promise<number> {
    const { count } = await this.prisma.aiEvalRun.updateMany({
      where: { status: 'running' },
      data: { status: 'failed', error, finishedAt: at },
    });
    return count;
  }
}

function toRun(row: EvalRunRow): EvalRun {
  return {
    id: row.id,
    capability: row.capability,
    modelId: row.modelId,
    promptVersion: row.promptVersion,
    status: row.status as EvalRunStatus,
    startedBy: row.startedBy,
    bindingAtStart: row.bindingAtStart as unknown as BindingAtStart | null,
    caseCount: row.caseCount,
    skipped: row.skipped as Record<string, number>,
    scores: row.scores as unknown as RunScores | null,
    cases: row.cases as unknown as CaseResult[] | null,
    cost: row.costMicros !== null && row.currency ? { micros: Number(row.costMicros), currency: row.currency } : null,
    credits: row.credits?.toFixed(6) ?? null,
    error: row.error,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}
