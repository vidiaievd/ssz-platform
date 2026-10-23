import { Injectable } from '@nestjs/common';
import type { AttemptAiDraftModel } from '../../../../../generated/prisma/models/AttemptAiDraft.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { AttemptAiDraft, type AiDraftMark, type AiDraftRemark } from '../../domain/entities/attempt-ai-draft.entity.js';
import type { SettledOutcomes } from '../../domain/draft-outcomes.js';
import type { IAttemptAiDraftRepository } from '../../domain/repositories/attempt-ai-draft.repository.js';

@Injectable()
export class PrismaAttemptAiDraftRepository implements IAttemptAiDraftRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByAiCallId(aiCallId: string): Promise<AttemptAiDraft | null> {
    const row = await this.prisma.attemptAiDraft.findUnique({ where: { aiCallId } });
    return row ? toDomain(row) : null;
  }

  async findByAttempt(attemptId: string, capability: string): Promise<AttemptAiDraft | null> {
    const row = await this.prisma.attemptAiDraft.findUnique({
      where: { attemptId_capability: { attemptId, capability } },
    });
    return row ? toDomain(row) : null;
  }

  async listDecided(capability: string, limit: number): Promise<AttemptAiDraft[]> {
    const rows = await this.prisma.attemptAiDraft.findMany({
      where: { capability, decidedAt: { not: null } },
      orderBy: [{ decidedAt: 'desc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map(toDomain);
  }

  async save(draft: AttemptAiDraft): Promise<'saved' | 'conflict'> {
    const data = {
      status: draft.status,
      // The remarks are plain JSON; Prisma's write type for Json wants its own spelling of that.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: draft.items as any,
      summary: draft.summary,
      // "No marks" is written as an empty list rather than a SQL null: a rerun without marks
      // must clear the old ones, and `Prisma.DbNull` would mean importing the client as a value.
      // A rubric is never empty, so the empty list cannot mean anything else.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      marks: (draft.marks ?? []) as any,
      errorCode: draft.errorCode,
      providerId: draft.providerId,
      modelId: draft.modelId,
      promptVersion: draft.promptVersion,
      aiCallId: draft.aiCallId,
      // Never cleared once written, so an absent value leaves the column alone — `Prisma.DbNull`
      // would mean importing the client as a value, which breaks the test suites.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      outcomes: (draft.outcomes ?? undefined) as any,
      decidedAt: draft.decidedAt,
      updatedAt: draft.updatedAt,
    };
    try {
      await this.prisma.attemptAiDraft.upsert({
        where: { id: draft.id },
        create: {
          id: draft.id,
          attemptId: draft.attemptId,
          capability: draft.capability,
          createdAt: draft.createdAt,
          ...data,
        },
        update: data,
      });
      return 'saved';
    } catch (err) {
      if (isUniqueViolation(err)) return 'conflict';
      throw err;
    }
  }
}

function toDomain(row: AttemptAiDraftModel): AttemptAiDraft {
  return AttemptAiDraft.restore(row.id, {
    attemptId: row.attemptId,
    capability: row.capability,
    status: row.status,
    items: row.items as unknown as AiDraftRemark[],
    summary: row.summary,
    marks: Array.isArray(row.marks) && row.marks.length > 0 ? (row.marks as unknown as AiDraftMark[]) : null,
    errorCode: row.errorCode,
    providerId: row.providerId,
    modelId: row.modelId,
    promptVersion: row.promptVersion,
    aiCallId: row.aiCallId,
    outcomes: row.outcomes as unknown as SettledOutcomes | null,
    decidedAt: row.decidedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

/** Prisma's P2002 by its code: importing the client as a value breaks the test suites (as in the attempt repository). */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}
