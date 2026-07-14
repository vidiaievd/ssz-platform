import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsUUID, Min } from 'class-validator';
import { ListeningStageType } from '../../../domain/value-objects/listening-stage-type.vo.js';

export class CreateListeningStageRequestDto {
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
