import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { ILessonContentVariantRepository } from '../../domain/repositories/lesson-content-variant.repository.interface.js';
import { LessonContentVariantEntity } from '../../domain/entities/lesson-content-variant.entity.js';
import { DifficultyLevel } from '../../../container/domain/value-objects/difficulty-level.vo.js';
import { LessonContentVariantMapper } from './mappers/lesson-content-variant.mapper.js';
import { domainDifficultyToPrisma } from './mappers/enum-converters.js';

@Injectable()
export class PrismaLessonContentVariantRepository implements ILessonContentVariantRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<LessonContentVariantEntity | null> {
    const raw = await this.prisma.lessonContentVariant.findUnique({ where: { id } });
    return raw ? LessonContentVariantMapper.toDomain(raw) : null;
  }

  async findByLessonId(
    lessonId: string,
    onlyPublished = false,
  ): Promise<LessonContentVariantEntity[]> {
    const rows = await this.prisma.lessonContentVariant.findMany({
      where: {
        lessonId,
        deletedAt: null,
        ...(onlyPublished ? { status: 'PUBLISHED' } : {}),
      },
      orderBy: [{ minLevel: 'asc' }, { explanationLanguage: 'asc' }],
    });
    return rows.map((row) => LessonContentVariantMapper.toDomain(row));
  }

  async findByCompositeKey(
    lessonId: string,
    explanationLanguage: string,
    minLevel: DifficultyLevel,
    maxLevel: DifficultyLevel,
  ): Promise<LessonContentVariantEntity | null> {
    const raw = await this.prisma.lessonContentVariant.findUnique({
      where: {
        lessonId_explanationLanguage_minLevel_maxLevel: {
          lessonId,
          explanationLanguage,
          minLevel: domainDifficultyToPrisma(minLevel),
          maxLevel: domainDifficultyToPrisma(maxLevel),
        },
      },
    });
    return raw ? LessonContentVariantMapper.toDomain(raw) : null;
  }

  async save(entity: LessonContentVariantEntity): Promise<LessonContentVariantEntity> {
    const exists = await this.prisma.lessonContentVariant.findUnique({
      where: { id: entity.id },
      select: { id: true },
    });

    const raw = exists
      ? await this.prisma.lessonContentVariant.update({
          where: { id: entity.id },
          data: LessonContentVariantMapper.toUpdateData(entity),
        })
      : await this.prisma.lessonContentVariant.create({
          data: LessonContentVariantMapper.toCreateData(entity),
        });

    return LessonContentVariantMapper.toDomain(raw);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.lessonContentVariant.delete({ where: { id } });
  }

  /**
   * Bulk soft-delete — sets deleted_at on all non-deleted variants for a lesson.
   * Called by DeleteLessonHandler after the lesson itself is soft-deleted.
   * Does NOT publish per-variant events; the lesson's LessonDeletedEvent is sufficient.
   */
  async softDeleteByLessonId(lessonId: string): Promise<void> {
    const now = new Date();
    await this.prisma.lessonContentVariant.updateMany({
      where: { lessonId, deletedAt: null },
      data: { deletedAt: now, updatedAt: now },
    });
  }
}
