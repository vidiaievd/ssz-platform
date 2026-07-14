import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  ILessonParagraphTranslationRepository,
  IParagraphTranslationRow,
} from '../../domain/repositories/lesson-paragraph-translation.repository.interface.js';
import { LessonParagraphTranslationMapper } from './mappers/lesson-paragraph-translation.mapper.js';

@Injectable()
export class PrismaLessonParagraphTranslationRepository
  implements ILessonParagraphTranslationRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async findByVariantId(variantId: string): Promise<IParagraphTranslationRow[]> {
    const rows = await this.prisma.lessonParagraphTranslation.findMany({
      where: { lessonContentVariantId: variantId },
      orderBy: { paragraphIndex: 'asc' },
    });
    return rows.map((row) => LessonParagraphTranslationMapper.toDomain(row));
  }

  async replaceForVariant(variantId: string, rows: IParagraphTranslationRow[]): Promise<void> {
    const createData = LessonParagraphTranslationMapper.toCreateManyData(variantId, rows);

    await this.prisma.$transaction([
      this.prisma.lessonParagraphTranslation.deleteMany({
        where: { lessonContentVariantId: variantId },
      }),
      ...(createData.length > 0
        ? [this.prisma.lessonParagraphTranslation.createMany({ data: createData })]
        : []),
    ]);
  }
}
