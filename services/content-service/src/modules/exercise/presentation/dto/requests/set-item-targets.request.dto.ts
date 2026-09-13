import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AtomType, TargetRole } from '../../../domain/value-objects/atom-type.vo.js';

export class ItemTargetDto {
  @ApiProperty({ enum: AtomType, example: AtomType.GRAMMAR_RULE_ATOM })
  @IsEnum(AtomType)
  atomType!: AtomType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  atomId!: string;

  @ApiProperty({
    enum: TargetRole,
    description:
      '`focus` is what the item tests. `context` is what the learner had to know to get ' +
      'there and was not examined on — the word inside a gap that is testing an ending. ' +
      'The two carry different weight as evidence.',
    example: TargetRole.FOCUS,
  })
  @IsEnum(TargetRole)
  role!: TargetRole;
}

export class SetItemTargetsRequestDto {
  @ApiPropertyOptional({
    description:
      'Which piece of the exercise this is about, spelled exactly as the template spells ' +
      'it in its per-item results (`sentenceId#tokenIndex` for a gap, the pair id for a ' +
      'pair). Omit or send null to address the whole exercise — the only option for ' +
      'templates that grade as one.',
    example: 's1#5',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  itemKey?: string | null;

  @ApiProperty({
    type: [ItemTargetDto],
    description:
      'The complete statement about this item — it replaces whatever was there. An empty ' +
      'array clears the item, which says "this gap is about nothing in particular".',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemTargetDto)
  targets!: ItemTargetDto[];
}
