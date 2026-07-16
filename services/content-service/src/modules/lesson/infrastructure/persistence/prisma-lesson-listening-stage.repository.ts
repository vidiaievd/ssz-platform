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

  async replaceForVariant(variantId: string, stages: LessonListeningStageEntity[]): Promise<void> {
    const createData = LessonListeningStageMapper.toCreateManyData(stages);

    await this.prisma.$transaction([
      this.prisma.lessonListeningStage.deleteMany({
        where: { lessonContentVariantId: variantId },
      }),
      ...(createData.length > 0
        ? [this.prisma.lessonListeningStage.createMany({ data: createData })]
        : []),
    ]);
  }
}
