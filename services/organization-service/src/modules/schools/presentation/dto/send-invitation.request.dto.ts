import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class TeachingLanguageDto {
  @ApiProperty({ example: 'nb', description: 'ISO 639-1 language code' })
  @IsString()
  @Length(2, 2)
  code!: string;

  @ApiPropertyOptional({ example: 'C2', description: 'CEFR level' })
  @IsOptional()
  @IsString()
  @Matches(/^(A1|A2|B1|B2|C1|C2)$/)
  level?: string;
}
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

  @ApiPropertyOptional({ example: 'Anna', description: 'Optional hint — school-provided first name. Seeds the teacher profile on accept.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Smith', description: 'Optional hint — school-provided last name. Seeds the teacher profile on accept.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ example: '+380501234567', description: 'Optional contact phone hint for teacher.' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

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
    type: [TeachingLanguageDto],
    description: 'Teaching languages (role=TEACHER only). Materialized into TeachingProfile on accept.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeachingLanguageDto)
  teachingLanguages?: TeachingLanguageDto[];

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
