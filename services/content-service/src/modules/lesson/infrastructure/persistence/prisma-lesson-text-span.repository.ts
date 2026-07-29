import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { ILessonTextSpanRepository } from '../../domain/repositories/lesson-text-span.repository.interface.js';
import { LessonTextSpanEntity } from '../../domain/entities/lesson-text-span.entity.js';
import { LessonTextSpanMapper } from './mappers/lesson-text-span.mapper.js';

@Injectable()
export class PrismaLessonTextSpanRepository implements ILessonTextSpanRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByVariantId(variantId: string): Promise<LessonTextSpanEntity[]> {
    const rows = await this.prisma.lessonTextSpan.findMany({
      where: { lessonContentVariantId: variantId },
      orderBy: [{ paragraphIndex: 'asc' }, { charStart: 'asc' }],
    });
    return rows.map((row) => LessonTextSpanMapper.toDomain(row));
  }

  async findById(id: string): Promise<LessonTextSpanEntity | null> {
    const row = await this.prisma.lessonTextSpan.findUnique({ where: { id } });
    return row ? LessonTextSpanMapper.toDomain(row) : null;
  }

  async save(span: LessonTextSpanEntity): Promise<LessonTextSpanEntity> {
    const data = LessonTextSpanMapper.toCreateData(span);

    const row = await this.prisma.lessonTextSpan.upsert({
      where: { id: data.id },
      create: data,
      // Only the anchor and the note ever change; kind, refId and authorship are
      // immutable by design (re-pointing a span is a delete plus a create).
      update: {
        paragraphIndex: data.paragraphIndex,
        charStart: data.charStart,
        charEnd: data.charEnd,
        textSnapshot: data.textSnapshot,
        note: data.note,
        updatedAt: data.updatedAt,
      },
    });
    return LessonTextSpanMapper.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.lessonTextSpan.deleteMany({ where: { id } });
  }

  async deleteByVariantAndRef(variantId: string, refId: string): Promise<number> {
    const result = await this.prisma.lessonTextSpan.deleteMany({
      where: { lessonContentVariantId: variantId, refId },
    });
    return result.count;
  }
}
