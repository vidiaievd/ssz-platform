import { Injectable } from '@nestjs/common';
import { parseRecipe } from '@ssz/shared-kernel/skills';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  CourseRecipeUsage,
  ICourseRecipeUsageReader,
} from '../../domain/repositories/course-recipe-usage.reader.interface.js';

@Injectable()
export class PrismaCourseRecipeUsageReader implements ICourseRecipeUsageReader {
  constructor(private readonly prisma: PrismaService) {}

  async listForSchool(schoolId: string): Promise<CourseRecipeUsage[]> {
    const rows = await this.prisma.container.findMany({
      where: {
        ownerSchoolId: schoolId,
        containerType: 'COURSE',
        deletedAt: null,
        archivedAt: null,
      },
      select: { id: true, title: true, coverageRecipe: true },
      orderBy: { title: 'asc' },
    });

    return rows.map((row) => ({
      courseId: row.id,
      title: row.title,
      // The same lenient read the resolver gives the column: null stays null.
      recipe: row.coverageRecipe === null ? null : parseRecipe(row.coverageRecipe),
    }));
  }
}
