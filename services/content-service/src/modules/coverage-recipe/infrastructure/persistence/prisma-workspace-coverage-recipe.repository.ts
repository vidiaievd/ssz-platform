import { Injectable } from '@nestjs/common';
import { parseRecipe } from '@ssz/shared-kernel/skills';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { WorkspaceCoverageRecipeEntity } from '../../domain/entities/workspace-coverage-recipe.entity.js';
import type { IWorkspaceCoverageRecipeRepository } from '../../domain/repositories/workspace-coverage-recipe.repository.interface.js';

@Injectable()
export class PrismaWorkspaceCoverageRecipeRepository implements IWorkspaceCoverageRecipeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBySchoolId(schoolId: string): Promise<WorkspaceCoverageRecipeEntity | null> {
    const raw = await this.prisma.workspaceCoverageRecipe.findUnique({ where: { schoolId } });
    if (!raw) return null;

    // Lenient on the way out: a value an axis has since retired costs its rule only.
    return WorkspaceCoverageRecipeEntity.reconstitute(raw.schoolId, {
      recipe: parseRecipe(raw.recipe),
      updatedAt: raw.updatedAt,
      updatedByUserId: raw.updatedByUserId,
    });
  }

  async save(entity: WorkspaceCoverageRecipeEntity): Promise<void> {
    const data = {
      recipe: entity.recipe as unknown as Prisma.InputJsonValue,
      updatedByUserId: entity.updatedByUserId,
    };
    await this.prisma.workspaceCoverageRecipe.upsert({
      where: { schoolId: entity.schoolId },
      create: { schoolId: entity.schoolId, ...data },
      update: data,
    });
  }
}
