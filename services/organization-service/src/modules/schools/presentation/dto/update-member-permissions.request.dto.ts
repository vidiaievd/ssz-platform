import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString } from 'class-validator';
import { ALL_CAPABILITIES } from '../../domain/value-objects/capability.vo.js';

export class UpdateMemberPermissionsRequestDto {
  @ApiProperty({
    type: [String],
    description: 'Full replacement set of capabilities for this MANAGER.',
    enum: ALL_CAPABILITIES,
    example: ['invitations:create_teacher', 'groups:create'],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  capabilities!: string[];
}
