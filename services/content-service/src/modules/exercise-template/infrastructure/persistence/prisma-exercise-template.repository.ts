import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  IExerciseTemplateRepository,
  EXERCISE_TEMPLATE_REPOSITORY,
} from '../../domain/repositories/exercise-template.repository.interface.js';
import { ExerciseTemplateEntity } from '../../domain/entities/exercise-template.entity.js';
import { ExerciseTemplateMapper } from './mappers/exercise-template.mapper.js';

export { EXERCISE_TEMPLATE_REPOSITORY };

@Injectable()
export class PrismaExerciseTemplateRepository implements IExerciseTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(onlyActive = false): Promise<ExerciseTemplateEntity[]> {
    const rows = await this.prisma.exerciseTemplate.findMany({
      where: onlyActive ? { isActive: true } : undefined,
      orderBy: { code: 'asc' },
    });
    return rows.map((row) => ExerciseTemplateMapper.toDomain(row));
  }

  async findByCode(code: string): Promise<ExerciseTemplateEntity | null> {
    const raw = await this.prisma.exerciseTemplate.findUnique({ where: { code } });
    return raw ? ExerciseTemplateMapper.toDomain(raw) : null;
  }

  async findById(id: string): Promise<ExerciseTemplateEntity | null> {
    const raw = await this.prisma.exerciseTemplate.findUnique({ where: { id } });
    return raw ? ExerciseTemplateMapper.toDomain(raw) : null;
  }
}
