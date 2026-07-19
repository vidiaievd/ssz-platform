import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { ILessonVideoQuestionRepository } from '../../domain/repositories/lesson-video-question.repository.interface.js';
import { LessonVideoQuestionEntity } from '../../domain/entities/lesson-video-question.entity.js';
import { LessonVideoQuestionMapper } from './mappers/lesson-video-question.mapper.js';

@Injectable()
export class PrismaLessonVideoQuestionRepository implements ILessonVideoQuestionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByVariantId(variantId: string): Promise<LessonVideoQuestionEntity | null> {
    const row = await this.prisma.lessonVideoQuestion.findUnique({
      where: { lessonContentVariantId: variantId },
    });
    return row ? LessonVideoQuestionMapper.toDomain(row) : null;
  }

  async upsertForVariant(entity: LessonVideoQuestionEntity): Promise<LessonVideoQuestionEntity> {
    const data = LessonVideoQuestionMapper.toUpsertData(entity);
    const raw = await this.prisma.lessonVideoQuestion.upsert({
      where: { lessonContentVariantId: data.lessonContentVariantId },
      create: data,
      update: { exerciseId: data.exerciseId, updatedAt: data.updatedAt },
    });
    return LessonVideoQuestionMapper.toDomain(raw);
  }

  async deleteForVariant(variantId: string): Promise<void> {
    await this.prisma.lessonVideoQuestion.deleteMany({
      where: { lessonContentVariantId: variantId },
    });
  }
}
