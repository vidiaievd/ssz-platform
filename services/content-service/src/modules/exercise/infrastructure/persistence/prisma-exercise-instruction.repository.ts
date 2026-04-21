import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  IExerciseInstructionRepository,
  EXERCISE_INSTRUCTION_REPOSITORY,
} from '../../domain/repositories/exercise-instruction.repository.interface.js';
import { ExerciseInstructionEntity } from '../../domain/entities/exercise-instruction.entity.js';
import { ExerciseInstructionMapper } from './mappers/exercise-instruction.mapper.js';

export { EXERCISE_INSTRUCTION_REPOSITORY };

@Injectable()
export class PrismaExerciseInstructionRepository implements IExerciseInstructionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ExerciseInstructionEntity | null> {
    const raw = await this.prisma.exerciseInstruction.findUnique({ where: { id } });
    return raw ? ExerciseInstructionMapper.toDomain(raw) : null;
  }

  async findByExerciseId(exerciseId: string): Promise<ExerciseInstructionEntity[]> {
    const rows = await this.prisma.exerciseInstruction.findMany({
      where: { exerciseId },
      orderBy: { instructionLanguage: 'asc' },
    });
    return rows.map((row) => ExerciseInstructionMapper.toDomain(row));
  }

  async findByExerciseAndLanguage(
    exerciseId: string,
    instructionLanguage: string,
  ): Promise<ExerciseInstructionEntity | null> {
    const raw = await this.prisma.exerciseInstruction.findUnique({
      where: { exerciseId_instructionLanguage: { exerciseId, instructionLanguage } },
    });
    return raw ? ExerciseInstructionMapper.toDomain(raw) : null;
  }

  async upsert(
    entity: ExerciseInstructionEntity,
  ): Promise<{ entity: ExerciseInstructionEntity; wasCreated: boolean }> {
    const existing = await this.prisma.exerciseInstruction.findUnique({
      where: {
        exerciseId_instructionLanguage: {
          exerciseId: entity.exerciseId,
          instructionLanguage: entity.instructionLanguage,
        },
      },
      select: { id: true },
    });

    const raw = existing
      ? await this.prisma.exerciseInstruction.update({
          where: { id: existing.id },
          data: ExerciseInstructionMapper.toUpdateData(entity),
        })
      : await this.prisma.exerciseInstruction.create({
          data: ExerciseInstructionMapper.toCreateData(entity),
        });

    return {
      entity: ExerciseInstructionMapper.toDomain(raw),
      wasCreated: !existing,
    };
  }

  async delete(id: string): Promise<void> {
    await this.prisma.exerciseInstruction.delete({ where: { id } });
  }
}
