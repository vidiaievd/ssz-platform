import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { aggregateReviewGate } from '../domain/review-gate.js';
import type { ReviewGateGroup, ReviewGateThresholds } from '../domain/review-gate.js';
import { GetReviewGateQuery } from './get-review-gate.query.js';

export interface GetReviewGateResult {
  from: string | null;
  to: string | null;
  thresholds: ReviewGateThresholds;
  groups: ReviewGateGroup[];
}

/** The Q2 gate per template × model (plan 90, phase 7, step 10). */
@QueryHandler(GetReviewGateQuery)
@Injectable()
export class GetReviewGateHandler implements IQueryHandler<GetReviewGateQuery, GetReviewGateResult> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  async execute(query: GetReviewGateQuery): Promise<GetReviewGateResult> {
    const thresholds = this.config.getOrThrow<AppConfig['reviewGate']>('reviewGate');
    const day: { gte?: Date; lte?: Date } = {};
    if (query.from) day.gte = new Date(`${query.from}T00:00:00Z`);
    if (query.to) day.lte = new Date(`${query.to}T00:00:00Z`);

    const rows = await this.prisma.aiDraftQualityDaily.findMany({
      where: query.from || query.to ? { day } : undefined,
      select: {
        capability: true,
        modelId: true,
        templateCode: true,
        draftsSettled: true,
        remarksAccepted: true,
        remarksEdited: true,
        remarksDiscarded: true,
        remarksUntouched: true,
        reviews: true,
        disputes: true,
        teacherVerdicts: true,
        teacherOverturned: true,
      },
    });
    return {
      from: query.from,
      to: query.to,
      thresholds: { ...thresholds },
      groups: aggregateReviewGate(rows, thresholds),
    };
  }
}
