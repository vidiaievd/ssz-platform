import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsUUID } from 'class-validator';
import { MemberRole } from '../../domain/value-objects/member-role.vo.js';

export class AddMemberRequestDto {
  @ApiProperty({ example: 'uuid-of-user' })
  @IsUUID()
  userId: string;

  @ApiProperty({ enum: MemberRole, example: MemberRole.TEACHER })
  @IsEnum(MemberRole)
  role: MemberRole;
}
