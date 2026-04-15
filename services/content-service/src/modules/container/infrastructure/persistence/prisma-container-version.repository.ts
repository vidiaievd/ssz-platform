import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { IContainerVersionRepository } from '../../domain/repositories/container-version.repository.interface.js';
import { ContainerVersionEntity } from '../../domain/entities/container-version.entity.js';
import { ContainerVersionMapper } from './mappers/container-version.mapper.js';

@Injectable()
export class PrismaContainerVersionRepository implements IContainerVersionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ContainerVersionEntity | null> {
    const raw = await this.prisma.containerVersion.findUnique({ where: { id } });
    return raw ? ContainerVersionMapper.toDomain(raw) : null;
  }

  async findByContainerId(containerId: string): Promise<ContainerVersionEntity[]> {
    const rows = await this.prisma.containerVersion.findMany({
      where: { containerId },
      orderBy: { versionNumber: 'asc' },
    });
    return rows.map((row) => ContainerVersionMapper.toDomain(row));
  }

  async findDraftByContainerId(containerId: string): Promise<ContainerVersionEntity | null> {
    const raw = await this.prisma.containerVersion.findFirst({
      where: { containerId, status: 'DRAFT' },
    });
    return raw ? ContainerVersionMapper.toDomain(raw) : null;
  }

  async findPublishedByContainerId(containerId: string): Promise<ContainerVersionEntity | null> {
    const raw = await this.prisma.containerVersion.findFirst({
      where: { containerId, status: 'PUBLISHED' },
    });
    return raw ? ContainerVersionMapper.toDomain(raw) : null;
  }

  async save(entity: ContainerVersionEntity): Promise<ContainerVersionEntity> {
    const exists = await this.prisma.containerVersion.findUnique({
      where: { id: entity.id },
      select: { id: true },
    });

    const raw = exists
      ? await this.prisma.containerVersion.update({
          where: { id: entity.id },
          data: ContainerVersionMapper.toUpdateData(entity),
        })
      : await this.prisma.containerVersion.create({
          data: ContainerVersionMapper.toCreateData(entity),
        });

    return ContainerVersionMapper.toDomain(raw);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.containerVersion.delete({ where: { id } });
  }

  async publishVersion(params: {
    versionId: string;
    containerId: string;
    previousVersionId: string | null;
    sunsetDays: number;
    publishedByUserId: string;
    slug?: string;
  }): Promise<{ sunsetAt: Date | null }> {
    return this.prisma.$transaction(async (tx) => {
      // Lock the container row to prevent concurrent publishes.
      await tx.$queryRaw`SELECT id FROM containers WHERE id = ${params.containerId}::uuid FOR UPDATE`;

      // Guard: verify the version is still a draft inside the transaction.
      const version = await tx.containerVersion.findUnique({
        where: { id: params.versionId },
        select: { status: true },
      });
      if (!version || version.status !== 'DRAFT') {
        throw new Error(`Version ${params.versionId} is not in DRAFT status`);
      }

      const now = new Date();
      let sunsetAt: Date | null = null;

      // Deprecate the currently published version if one exists.
      if (params.previousVersionId) {
        sunsetAt = new Date(now.getTime() + params.sunsetDays * 24 * 60 * 60 * 1000);
        await tx.containerVersion.update({
          where: { id: params.previousVersionId },
          data: { status: 'DEPRECATED', deprecatedAt: now, sunsetAt },
        });
      }

      // Publish the new version.
      await tx.containerVersion.update({
        where: { id: params.versionId },
        data: {
          status: 'PUBLISHED',
          publishedAt: now,
          publishedByUserId: params.publishedByUserId,
        },
      });

      // Update container's current published pointer (and slug if first publication).
      await tx.container.update({
        where: { id: params.containerId },
        data: {
          currentPublishedVersionId: params.versionId,
          updatedAt: now,
          ...(params.slug !== undefined ? { slug: params.slug } : {}),
        },
      });

      return { sunsetAt };
    });
  }
}
