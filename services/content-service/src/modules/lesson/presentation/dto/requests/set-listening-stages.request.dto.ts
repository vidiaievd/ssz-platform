import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';
import { ListeningStageType } from '../../../domain/value-objects/listening-stage-type.vo.js';

export class ListeningStageEntryDto {
  @ApiProperty({ example: 'uuid-of-exercise', description: 'Exercise reused for grading' })
  @IsUUID()
  exerciseId: string;

  @ApiProperty({ example: 0, minimum: 0, description: '0-based ordinal within the variant' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position: number;

  @ApiProperty({ example: 'gap_fill', enum: ListeningStageType })
  @IsEnum(ListeningStageType)
  stageType: ListeningStageType;
}

export class SetListeningStagesRequestDto {
  @ApiProperty({ type: [ListeningStageEntryDto], description: 'Full replacement set' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ListeningStageEntryDto)
  stages: ListeningStageEntryDto[];
}
