import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsUUID } from 'class-validator';
import { InvitableRoles, type InvitableRole } from '../../domain/value-objects/member-role.vo.js';

export class AddMemberRequestDto {
  @ApiProperty({ example: 'uuid-of-user' })
  @IsUUID()
  userId: string;

  @ApiProperty({
    enum: InvitableRoles,
    example: 'TEACHER',
    description: 'Role to assign. OWNER cannot be assigned via this endpoint.',
  })
  @IsEnum(InvitableRoles)
  role: InvitableRole;
}
