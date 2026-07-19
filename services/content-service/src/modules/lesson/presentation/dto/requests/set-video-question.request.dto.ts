import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SetVideoQuestionRequestDto {
  @ApiProperty({ example: 'uuid-of-exercise', description: 'Exercise reused for grading' })
  @IsUUID()
  exerciseId: string;
}
