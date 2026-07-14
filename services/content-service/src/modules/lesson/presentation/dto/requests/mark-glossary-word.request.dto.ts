import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MarkGlossaryWordRequestDto {
  @ApiProperty({ example: 'uuid-of-vocabulary-item' })
  @IsUUID()
  vocabularyItemId: string;
}
