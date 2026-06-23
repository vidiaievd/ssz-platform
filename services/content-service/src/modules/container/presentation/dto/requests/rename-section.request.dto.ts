import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class RenameSectionRequestDto {
  @ApiProperty({ example: 'A1 — Beginner (revised)' })
  @IsString()
  @MaxLength(100)
  title: string;
}
