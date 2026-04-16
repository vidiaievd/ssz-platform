import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  ILessonVariantMediaRefRepository,
  IMediaRefRow,
} from '../../domain/repositories/lesson-variant-media-ref.repository.interface.js';
import { LessonVariantMediaRefEntity } from '../../domain/entities/lesson-variant-media-ref.entity.js';
import { LessonVariantMediaRefMapper } from './mappers/lesson-variant-media-ref.mapper.js';

@Injectable()
export class PrismaLessonVariantMediaRefRepository implements ILessonVariantMediaRefRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByVariantId(variantId: string): Promise<LessonVariantMediaRefEntity[]> {
    const rows = await this.prisma.lessonVariantMediaRef.findMany({
      where: { lessonContentVariantId: variantId },
      orderBy: { positionInText: 'asc' },
    });
    return rows.map((row) => LessonVariantMediaRefMapper.toDomain(row));
  }

  /**
   * Atomically replaces all media refs for a variant.
   * Runs deleteMany + createMany inside a single transaction so the table is
   * never in a partially-updated state from the caller's perspective.
   * Called on every create/update of a variant's bodyMarkdown.
   */
  async replaceForVariant(variantId: string, refs: IMediaRefRow[]): Promise<void> {
    const createData = LessonVariantMediaRefMapper.toCreateManyData(variantId, refs);

    await this.prisma.$transaction([
      this.prisma.lessonVariantMediaRef.deleteMany({
        where: { lessonContentVariantId: variantId },
      }),
      ...(createData.length > 0
        ? [this.prisma.lessonVariantMediaRef.createMany({ data: createData })]
        : []),
    ]);
  }

  async deleteByVariantId(variantId: string): Promise<void> {
    await this.prisma.lessonVariantMediaRef.deleteMany({
      where: { lessonContentVariantId: variantId },
    });
  }
}
