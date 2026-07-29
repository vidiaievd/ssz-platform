import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  GlossaryMarkRow,
  ILessonGlossaryMarkRepository,
} from '../../domain/repositories/lesson-glossary-mark.repository.interface.js';
import { LessonGlossaryMarkMapper } from './mappers/lesson-glossary-mark.mapper.js';

@Injectable()
export class PrismaLessonGlossaryMarkRepository implements ILessonGlossaryMarkRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByVariantId(variantId: string): Promise<GlossaryMarkRow[]> {
    const rows = await this.prisma.lessonVariantGlossaryMark.findMany({
      where: { lessonContentVariantId: variantId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => LessonGlossaryMarkMapper.toDomain(row));
  }

  async upsertMark(variantId: string, vocabularyItemId: string): Promise<GlossaryMarkRow> {
    const now = new Date();
    const raw = await this.prisma.lessonVariantGlossaryMark.upsert({
      where: {
        lessonContentVariantId_vocabularyItemId: {
          lessonContentVariantId: variantId,
          vocabularyItemId,
        },
      },
      create: {
        id: randomUUID(),
        lessonContentVariantId: variantId,
        vocabularyItemId,
        occurrenceCount: 1,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        occurrenceCount: { increment: 1 },
        updatedAt: now,
      },
    });
    return LessonGlossaryMarkMapper.toDomain(raw);
  }

  async deleteMark(variantId: string, vocabularyItemId: string): Promise<void> {
    await this.prisma.lessonVariantGlossaryMark.deleteMany({
      where: { lessonContentVariantId: variantId, vocabularyItemId },
    });
  }
}
