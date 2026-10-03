import type {
  $Enums,
  GrammarRuleAtom as PrismaGrammarRuleAtom,
} from '../../../../../../generated/prisma/client.js';
import { GrammarRuleAtom } from '../../../domain/entities/grammar-rule-atom.entity.js';
import { domainAtomTrackToPrisma, prismaAtomTrackToDomain } from './enum-converters.js';

export interface GrammarRuleAtomCreateData {
  id: string;
  grammarRuleId: string;
  key: string;
  title: string;
  description: string | null;
  track: $Enums.AtomTrack;
  position: number;
  createdAt: Date;
  createdByUserId: string;
  deletedAt: Date | null;
}

// `grammarRuleId` and `key` are writable here because a move re-parents the atom and may
// have to re-key it on the way. The id is the address, so neither touches a learner's card.
export type GrammarRuleAtomUpdateData = Pick<
  GrammarRuleAtomCreateData,
  'grammarRuleId' | 'key' | 'title' | 'description' | 'track' | 'position' | 'deletedAt'
>;

export class GrammarRuleAtomMapper {
  static toDomain(raw: PrismaGrammarRuleAtom): GrammarRuleAtom {
    return GrammarRuleAtom.reconstitute(raw.id, {
      grammarRuleId: raw.grammarRuleId,
      key: raw.key,
      title: raw.title,
      description: raw.description,
      track: prismaAtomTrackToDomain(raw.track),
      position: raw.position,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      createdByUserId: raw.createdByUserId,
      deletedAt: raw.deletedAt,
    });
  }

  static toCreateData(atom: GrammarRuleAtom): GrammarRuleAtomCreateData {
    return {
      id: atom.id,
      grammarRuleId: atom.grammarRuleId,
      key: atom.key,
      title: atom.title,
      description: atom.description,
      track: domainAtomTrackToPrisma(atom.track),
      position: atom.position,
      createdAt: atom.createdAt,
      createdByUserId: atom.createdByUserId,
      deletedAt: atom.deletedAt,
    };
  }

  static toUpdateData(atom: GrammarRuleAtom): GrammarRuleAtomUpdateData {
    return {
      grammarRuleId: atom.grammarRuleId,
      key: atom.key,
      title: atom.title,
      description: atom.description,
      track: domainAtomTrackToPrisma(atom.track),
      position: atom.position,
      deletedAt: atom.deletedAt,
    };
  }
}
