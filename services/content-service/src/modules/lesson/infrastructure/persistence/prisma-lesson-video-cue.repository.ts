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

  async findByVariantAndPosition(
    variantId: string,
    position: number,
  ): Promise<LessonVideoCueEntity | null> {
    const row = await this.prisma.lessonVideoCue.findUnique({
      where: { lessonContentVariantId_position: { lessonContentVariantId: variantId, position } },
    });
    return row ? LessonVideoCueMapper.toDomain(row) : null;
  }

  async save(entity: LessonVideoCueEntity): Promise<LessonVideoCueEntity> {
    const raw = await this.prisma.lessonVideoCue.create({
      data: LessonVideoCueMapper.toCreateData(entity),
    });
    return LessonVideoCueMapper.toDomain(raw);
  }
}
