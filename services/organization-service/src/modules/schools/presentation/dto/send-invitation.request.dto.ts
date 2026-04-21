import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum } from 'class-validator';
import { InvitableRoles, type InvitableRole } from '../../domain/value-objects/member-role.vo.js';

export class SendInvitationRequestDto {
  @ApiProperty({ example: 'teacher@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    enum: InvitableRoles,
    example: 'TEACHER',
    description: 'Role to assign. OWNER is not invitable — it is assigned at school creation.',
  })
  @IsEnum(InvitableRoles)
  role!: InvitableRole;
}
