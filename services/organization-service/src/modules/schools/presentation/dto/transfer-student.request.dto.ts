import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, IsIn } from 'class-validator';

export class TransferStudentRequestDto {
  @ApiProperty()
  @IsUUID()
  fromGroupId: string;

  @ApiProperty()
  @IsUUID()
  toGroupId: string;

  @ApiPropertyOptional({ enum: ['student', 'trial', 'observer'], default: 'student' })
  @IsOptional()
  @IsIn(['student', 'trial', 'observer'])
  role?: 'student' | 'trial' | 'observer';
}
