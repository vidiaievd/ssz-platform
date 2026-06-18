import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class TransferStudentRequestDto {
  @ApiProperty()
  @IsUUID()
  fromGroupId: string;

  @ApiProperty()
  @IsUUID()
  toGroupId: string;

  @ApiPropertyOptional({ enum: ['student', 'trial', 'observer'], default: 'student' })
  @IsOptional()
  @IsEnum(['student', 'trial', 'observer'])
  role?: 'student' | 'trial' | 'observer';
}
