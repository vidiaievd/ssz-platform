import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MemberRole } from '../../domain/value-objects/member-role.vo.js';
import { SchoolKind } from '../../domain/value-objects/school-kind.vo.js';

/**
 * One place a person works from: a school, or a private tutor's own space. Everything a
 * client needs to pick a shell and gate its controls before it fetches anything else.
 */
export class WorkspaceResponseDto {
  @ApiProperty({ description: 'Workspace UUID — the address every workspace screen is built on' })
  id!: string;

  @ApiProperty({
    enum: SchoolKind,
    description: 'SCHOOL for a school, SOLO for a private tutor. Decides which shell is drawn.',
    example: 'SCHOOL',
  })
  kind!: SchoolKind;

  @ApiProperty({ description: 'Display name', example: 'Nordick Language School' })
  name!: string;

  @ApiPropertyOptional({
    description: "A school's URL slug. Null for a solo workspace — it is never addressed by one.",
    example: 'nordick',
    nullable: true,
  })
  slug!: string | null;

  @ApiProperty({
    enum: MemberRole,
    description:
      "The caller's effective role here. The owner holds no roster row, so this is OWNER for them by ownership.",
    example: 'OWNER',
  })
  myRole!: MemberRole;
}
