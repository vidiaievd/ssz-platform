import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ALL_CAPABILITIES } from '../../domain/value-objects/capability.vo.js';
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

  @ApiPropertyOptional({
    description: 'Max weekly contact hours (role=TEACHER only). For employment_type=full, 40 is assumed.',
    minimum: 1,
    maximum: 80,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(80)
  maxWeeklyHours?: number;

  @ApiPropertyOptional({
    enum: ['full', 'part', 'contract'],
    description: 'HR employment label (role=TEACHER only). Default: "part".',
  })
  @IsOptional()
  @IsEnum(['full', 'part', 'contract'])
  employmentType?: 'full' | 'part' | 'contract';

  @ApiPropertyOptional({
    type: [String],
    description: 'Initial capability set (role=MANAGER only). Ignored for other roles.',
    enum: ALL_CAPABILITIES,
    example: ['invitations:create_teacher', 'groups:create'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  capabilities?: string[];
}
