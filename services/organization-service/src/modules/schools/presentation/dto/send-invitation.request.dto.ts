import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { InvitableRoles, type InvitableRole } from '../../domain/value-objects/member-role.vo.js';

export class SendInvitationRequestDto {
  @ApiProperty({ example: 'student@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    enum: InvitableRoles,
    example: 'STUDENT',
    description: 'Role to assign. OWNER is not invitable — it is assigned at school creation.',
  })
  @IsEnum(InvitableRoles)
  role!: InvitableRole;

  @ApiPropertyOptional({
    enum: ['register', 'onboard_existing'],
    default: 'register',
    description: '"register" — email not in system; "onboard_existing" — user exists but lacks student role.',
  })
  @IsOptional()
  @IsEnum(['register', 'onboard_existing'])
  kind?: 'register' | 'onboard_existing';

  @ApiPropertyOptional({ description: 'Group UUID to auto-add student after invite is accepted' })
  @IsOptional()
  @IsUUID()
  targetGroupId?: string | null;
}
