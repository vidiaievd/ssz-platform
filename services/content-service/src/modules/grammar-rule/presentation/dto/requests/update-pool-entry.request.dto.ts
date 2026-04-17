import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class UpdatePoolEntryRequestDto {
  @ApiProperty({ example: 2.0, minimum: 0.01, maximum: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(100)
  weight!: number;
}
