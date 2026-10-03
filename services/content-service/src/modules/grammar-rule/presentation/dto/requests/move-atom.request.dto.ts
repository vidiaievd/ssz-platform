import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class MoveAtomRequestDto {
  @ApiProperty({
    description:
      'The rule to move the atom under. The caller needs edit access to it as well as to ' +
      'the rule in the path.',
    format: 'uuid',
  })
  @IsUUID()
  targetRuleId!: string;

  @ApiPropertyOptional({
    description:
      'New slug for the atom, needed when the destination already holds a living atom under ' +
      'the current one — the ordinary case when two rules are merged. The move is rejected ' +
      'rather than silently renamed.',
    example: 'noun-gender',
    maxLength: 60,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Matches(/^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$/, {
    message: 'key must be kebab-case (letters, digits and single hyphens)',
  })
  key?: string;
}
