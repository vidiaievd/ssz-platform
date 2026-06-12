import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class NudgeRequestDto {
  @ApiProperty({ enum: ['all-at-risk'], example: 'all-at-risk' })
  @IsEnum(['all-at-risk'])
  scope!: 'all-at-risk';
}

export class NudgeResponseDto {
  @ApiProperty({ example: 12 })
  nudged!: number;
}
