import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  ExerciseTargetsView,
  ItemTargets,
  ResolvedTarget,
} from '../../../application/queries/get-item-targets/get-item-targets.handler.js';

export class ResolvedTargetResponseDto {
  @ApiProperty({ example: 'grammar_rule_atom' })
  atomType!: string;

  @ApiProperty({ format: 'uuid' })
  atomId!: string;

  @ApiProperty({ example: 'focus' })
  role!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Null when the atom is gone — the target is broken and `broken` says so.',
    example: 'Definite plural (-ene)',
  })
  atomTitle!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'grammar' })
  track!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    enum: ['atom_missing', 'item_missing'],
    description:
      '`item_missing`: the gap this addressed has been edited away — a gap key holds a ' +
      'token index, so editing the sentence moves it, and the author has to re-anchor. ' +
      '`atom_missing`: somebody retired the atom underneath. Computed on every read, never ' +
      'stored.',
  })
  broken!: 'atom_missing' | 'item_missing' | null;
}

export class ItemTargetsResponseDto {
  @ApiPropertyOptional({ nullable: true, example: 's1#5' })
  itemKey!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'G2 — huset' })
  label!: string | null;

  @ApiProperty({ type: [ResolvedTargetResponseDto] })
  targets!: ResolvedTargetResponseDto[];
}

export class ExerciseTargetsResponseDto {
  @ApiProperty({ format: 'uuid' })
  exerciseId!: string;

  @ApiProperty({ example: 'word_bank_gap_fill' })
  templateCode!: string;

  @ApiProperty({
    description:
      'False when the template grades as a whole and only the exercise itself can be ' +
      'addressed. The single row then carries `itemKey: null`.',
  })
  addressable!: boolean;

  @ApiProperty({
    type: [ItemTargetsResponseDto],
    description:
      'Every piece of the document, addressed or not — an author has to see which gaps say ' +
      'nothing about themselves, and an item left out would be indistinguishable from one ' +
      'nobody has got to yet.',
  })
  items!: ItemTargetsResponseDto[];

  static from(view: ExerciseTargetsView): ExerciseTargetsResponseDto {
    const dto = new ExerciseTargetsResponseDto();
    dto.exerciseId = view.exerciseId;
    dto.templateCode = view.templateCode;
    dto.addressable = view.addressable;
    dto.items = view.items.map((item: ItemTargets) => ({
      itemKey: item.itemKey,
      label: item.label,
      targets: item.targets.map((target: ResolvedTarget) => ({ ...target })),
    }));
    return dto;
  }
}
