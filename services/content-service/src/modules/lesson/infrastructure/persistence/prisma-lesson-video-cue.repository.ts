import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { ILessonVideoCueRepository } from '../../domain/repositories/lesson-video-cue.repository.interface.js';
import { LessonVideoCueEntity } from '../../domain/entities/lesson-video-cue.entity.js';
import { LessonVideoCueMapper } from './mappers/lesson-video-cue.mapper.js';

@Injectable()
export class PrismaLessonVideoCueRepository implements ILessonVideoCueRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByVariantId(variantId: string): Promise<LessonVideoCueEntity[]> {
    const rows = await this.prisma.lessonVideoCue.findMany({
      where: { lessonContentVariantId: variantId },
      orderBy: { position: 'asc' },
    });
    return rows.map((row) => LessonVideoCueMapper.toDomain(row));
  }

  async replaceForVariant(variantId: string, cues: LessonVideoCueEntity[]): Promise<void> {
    const createData = LessonVideoCueMapper.toCreateManyData(cues);

    await this.prisma.$transaction([
      this.prisma.lessonVideoCue.deleteMany({
        where: { lessonContentVariantId: variantId },
      }),
      ...(createData.length > 0
        ? [this.prisma.lessonVideoCue.createMany({ data: createData })]
        : []),
    ]);
  }
}
