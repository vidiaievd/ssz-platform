import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum } from 'class-validator';
import { MemberRole } from '../../domain/value-objects/member-role.vo.js';

export class SendInvitationRequestDto {
  @ApiProperty({ example: 'teacher@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: MemberRole, example: MemberRole.TEACHER })
  @IsEnum(MemberRole)
  role: MemberRole;
}
