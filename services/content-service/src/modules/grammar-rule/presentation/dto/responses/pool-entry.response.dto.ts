import { ApiProperty } from '@nestjs/swagger';
import { GrammarRuleExercisePoolEntry } from '../../../domain/entities/grammar-rule-exercise-pool-entry.entity.js';
import { ExerciseResponseDto } from '../../../../exercise/presentation/dto/responses/exercise.response.dto.js';
import type { PoolEntryWithExercise } from '../../../domain/repositories/grammar-rule-exercise-pool.repository.interface.js';

export class PoolEntryResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id!: string;

  @ApiProperty({ example: 'uuid-of-rule' })
  grammarRuleId!: string;

  @ApiProperty({ example: 'uuid-of-exercise' })
  exerciseId!: string;

  @ApiProperty({ example: 0 })
  position!: number;

  @ApiProperty({ example: 1.5 })
  weight!: number;

  @ApiProperty()
  addedAt!: Date;

  @ApiProperty({ example: 'uuid-of-user' })
  addedByUserId!: string;

  @ApiProperty({ type: ExerciseResponseDto })
  exercise!: ExerciseResponseDto;

  static from(
    entry: GrammarRuleExercisePoolEntry,
    exercise: ExerciseResponseDto,
  ): PoolEntryResponseDto {
    const dto = new PoolEntryResponseDto();
    dto.id = entry.id;
    dto.grammarRuleId = entry.grammarRuleId;
    dto.exerciseId = entry.exerciseId;
    dto.position = entry.position;
    dto.weight = entry.weight;
    dto.addedAt = entry.addedAt;
    dto.addedByUserId = entry.addedByUserId;
    dto.exercise = exercise;
    return dto;
  }

  static fromPoolEntryWithExercise(item: PoolEntryWithExercise): PoolEntryResponseDto {
    return PoolEntryResponseDto.from(item.entry, ExerciseResponseDto.from(item.exercise));
  }
}
