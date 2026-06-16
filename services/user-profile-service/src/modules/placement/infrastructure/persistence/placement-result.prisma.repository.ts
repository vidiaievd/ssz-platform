import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { PlacementResult } from '../../domain/entities/placement-result.entity.js';
import type { IPlacementResultRepository } from '../../domain/repositories/placement-result.repository.interface.js';

@Injectable()
export class PlacementResultPrismaRepository implements IPlacementResultRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(result: PlacementResult): Promise<void> {
    await (this.prisma as any).placementResult.create({
      data: {
        id: result.id,
        userId: result.userId,
        language: result.language,
        cefrLevel: result.cefrLevel,
        score: result.score,
        scope: result.scope,
        membershipId: result.membershipId ?? null,
        sourceLabel: result.sourceLabel,
        takenAt: result.takenAt,
        createdAt: result.createdAt,
      },
    });
  }

  async findAllByUserId(userId: string): Promise<PlacementResult[]> {
    const rows = await (this.prisma as any).placementResult.findMany({
      where: { userId },
      orderBy: { takenAt: 'desc' },
    });
    return rows.map((r: any) =>
      PlacementResult.rehydrate({
        id: r.id,
        userId: r.userId,
        language: r.language,
        cefrLevel: r.cefrLevel,
        score: r.score,
        scope: r.scope,
        membershipId: r.membershipId ?? undefined,
        sourceLabel: r.sourceLabel,
        takenAt: r.takenAt,
        createdAt: r.createdAt,
      }),
    );
  }

  async findLatestPlatformByUserAndLang(userId: string, language: string): Promise<PlacementResult | null> {
    const row = await (this.prisma as any).placementResult.findFirst({
      where: { userId, language, scope: 'platform' },
      orderBy: { takenAt: 'desc' },
    });
    if (!row) return null;
    return PlacementResult.rehydrate({
      id: row.id,
      userId: row.userId,
      language: row.language,
      cefrLevel: row.cefrLevel,
      score: row.score,
      scope: row.scope,
      membershipId: row.membershipId ?? undefined,
      sourceLabel: row.sourceLabel,
      takenAt: row.takenAt,
      createdAt: row.createdAt,
    });
  }
}
