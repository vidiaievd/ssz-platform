import { Injectable, Inject } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  CONTENT_CLIENT,
  type IContentClient,
} from '../../../../shared/application/ports/content-client.port.js';
import type { ICanDoProgressRepository } from '../../domain/repositories/can-do-progress.repository.interface.js';
import { CanDoProgressEntity } from '../../domain/entities/can-do-progress.entity.js';
import type { CanDoStatus } from '../../domain/entities/can-do-progress.entity.js';

@Injectable()
export class PrismaCanDoProgressRepository implements ICanDoProgressRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
  ) {}

  async findByUserAndDescriptor(
    userId: string,
    descriptorId: string,
  ): Promise<CanDoProgressEntity | null> {
    const row = await this.prisma.canDoProgress.findUnique({
      where: { userId_descriptorId: { userId, descriptorId } },
    });
    return row ? this.toEntity(row) : null;
  }

  async findByUserId(userId: string): Promise<CanDoProgressEntity[]> {
    const rows = await this.prisma.canDoProgress.findMany({ where: { userId } });
    return rows.map(this.toEntity);
  }

  async findByUserAndCourse(
    userId: string,
    courseContainerId: string,
  ): Promise<CanDoProgressEntity[]> {
    // Walk course → module relations to collect module IDs, then find descriptors
    // targeted by those modules via TARGETS relations.
    const courseRelationsResult = await this.contentClient.getRelationsBySource(
      'container',
      courseContainerId,
    );
    if (courseRelationsResult.isFail) return [];

    const moduleIds = courseRelationsResult.value
      .filter((r) => r.targetType === 'container')
      .map((r) => r.targetId);

    const descriptorIds = new Set<string>();
    await Promise.all(
      moduleIds.map(async (moduleId) => {
        const result = await this.contentClient.getRelationsBySource(
          'container',
          moduleId,
          'targets',
        );
        if (result.isOk) {
          for (const r of result.value) {
            if (r.targetType === 'can_do_descriptor') {
              descriptorIds.add(r.targetId);
            }
          }
        }
      }),
    );

    if (descriptorIds.size === 0) return [];

    const rows = await this.prisma.canDoProgress.findMany({
      where: { userId, descriptorId: { in: [...descriptorIds] } },
    });
    return rows.map(this.toEntity);
  }

  async upsert(entity: CanDoProgressEntity): Promise<void> {
    await this.prisma.canDoProgress.upsert({
      where: { userId_descriptorId: { userId: entity.userId, descriptorId: entity.descriptorId } },
      create: {
        id: entity.id,
        userId: entity.userId,
        descriptorId: entity.descriptorId,
        status: entity.status as never,
        achievedAt: entity.achievedAt,
        selfAssessed: entity.selfAssessed,
      },
      update: {
        status: entity.status as never,
        achievedAt: entity.achievedAt,
        selfAssessed: entity.selfAssessed,
      },
    });
  }

  private toEntity(row: {
    id: string;
    userId: string;
    descriptorId: string;
    status: string;
    achievedAt: Date | null;
    selfAssessed: boolean | null;
    createdAt: Date;
    updatedAt: Date;
  }): CanDoProgressEntity {
    return CanDoProgressEntity.reconstitute(row.id, {
      userId: row.userId,
      descriptorId: row.descriptorId,
      status: row.status as CanDoStatus,
      achievedAt: row.achievedAt,
      selfAssessed: row.selfAssessed,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
