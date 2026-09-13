import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { GrammarRuleAtom } from '../../../domain/entities/grammar-rule-atom.entity.js';
import { AtomTrack } from '../../../domain/value-objects/atom-track.vo.js';

export class GrammarRuleAtomResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  grammarRuleId!: string;

  @ApiProperty({ example: 'definite-plural' })
  key!: string;

  @ApiProperty({ example: 'Definite plural (-ene)' })
  title!: string;

  @ApiPropertyOptional({ nullable: true, example: 'husene, bøkene.' })
  description!: string | null;

  @ApiProperty({ enum: AtomTrack, example: AtomTrack.GRAMMAR })
  track!: AtomTrack;

  @ApiProperty({ example: 0 })
  position!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static from(atom: GrammarRuleAtom): GrammarRuleAtomResponseDto {
    const dto = new GrammarRuleAtomResponseDto();
    dto.id = atom.id;
    dto.grammarRuleId = atom.grammarRuleId;
    dto.key = atom.key;
    dto.title = atom.title;
    dto.description = atom.description;
    dto.track = atom.track;
    dto.position = atom.position;
    dto.createdAt = atom.createdAt.toISOString();
    dto.updatedAt = atom.updatedAt.toISOString();
    return dto;
  }
}
