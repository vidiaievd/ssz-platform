import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { ILessonListeningStageRepository } from '../../domain/repositories/lesson-listening-stage.repository.interface.js';
import { LessonListeningStageEntity } from '../../domain/entities/lesson-listening-stage.entity.js';
import { LessonListeningStageMapper } from './mappers/lesson-listening-stage.mapper.js';

@Injectable()
export class PrismaLessonListeningStageRepository implements ILessonListeningStageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByVariantId(variantId: string): Promise<LessonListeningStageEntity[]> {
    const rows = await this.prisma.lessonListeningStage.findMany({
      where: { lessonContentVariantId: variantId },
      orderBy: { position: 'asc' },
    });
    return rows.map((row) => LessonListeningStageMapper.toDomain(row));
  }

  async findByVariantAndPosition(
    variantId: string,
    position: number,
  ): Promise<LessonListeningStageEntity | null> {
    const row = await this.prisma.lessonListeningStage.findUnique({
      where: { lessonContentVariantId_position: { lessonContentVariantId: variantId, position } },
    });
    return row ? LessonListeningStageMapper.toDomain(row) : null;
  }

  async save(entity: LessonListeningStageEntity): Promise<LessonListeningStageEntity> {
    const raw = await this.prisma.lessonListeningStage.create({
      data: LessonListeningStageMapper.toCreateData(entity),
    });
    return LessonListeningStageMapper.toDomain(raw);
  }
}
