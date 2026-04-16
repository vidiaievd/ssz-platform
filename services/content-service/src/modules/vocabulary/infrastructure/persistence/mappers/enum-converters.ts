import { $Enums } from '../../../../../../generated/prisma/client.js';
import { PartOfSpeech } from '../../../domain/value-objects/part-of-speech.vo.js';
import { Register } from '../../../domain/value-objects/register.vo.js';

// DifficultyLevel and Visibility conversions are shared with the container module.
export {
  prismaDifficultyToDomain,
  domainDifficultyToPrisma,
  prismaVisibilityToDomain,
  domainVisibilityToPrisma,
} from '../../../../container/infrastructure/persistence/mappers/enum-converters.js';

// ─── PartOfSpeech ─────────────────────────────────────────────────────────────
// Prisma stores UPPER_CASE; domain uses lowercase.

const PRISMA_TO_DOMAIN_PART_OF_SPEECH: Record<$Enums.PartOfSpeech, PartOfSpeech> = {
  NOUN: PartOfSpeech.NOUN,
  VERB: PartOfSpeech.VERB,
  ADJECTIVE: PartOfSpeech.ADJECTIVE,
  ADVERB: PartOfSpeech.ADVERB,
  PRONOUN: PartOfSpeech.PRONOUN,
  PREPOSITION: PartOfSpeech.PREPOSITION,
  CONJUNCTION: PartOfSpeech.CONJUNCTION,
  INTERJECTION: PartOfSpeech.INTERJECTION,
  NUMERAL: PartOfSpeech.NUMERAL,
  PARTICLE: PartOfSpeech.PARTICLE,
  PHRASE: PartOfSpeech.PHRASE,
  OTHER: PartOfSpeech.OTHER,
};

const DOMAIN_TO_PRISMA_PART_OF_SPEECH: Record<PartOfSpeech, $Enums.PartOfSpeech> = {
  [PartOfSpeech.NOUN]: 'NOUN',
  [PartOfSpeech.VERB]: 'VERB',
  [PartOfSpeech.ADJECTIVE]: 'ADJECTIVE',
  [PartOfSpeech.ADVERB]: 'ADVERB',
  [PartOfSpeech.PRONOUN]: 'PRONOUN',
  [PartOfSpeech.PREPOSITION]: 'PREPOSITION',
  [PartOfSpeech.CONJUNCTION]: 'CONJUNCTION',
  [PartOfSpeech.INTERJECTION]: 'INTERJECTION',
  [PartOfSpeech.NUMERAL]: 'NUMERAL',
  [PartOfSpeech.PARTICLE]: 'PARTICLE',
  [PartOfSpeech.PHRASE]: 'PHRASE',
  [PartOfSpeech.OTHER]: 'OTHER',
};

export function prismaPartOfSpeechToDomain(value: $Enums.PartOfSpeech): PartOfSpeech {
  return PRISMA_TO_DOMAIN_PART_OF_SPEECH[value];
}

export function domainPartOfSpeechToPrisma(value: PartOfSpeech): $Enums.PartOfSpeech {
  return DOMAIN_TO_PRISMA_PART_OF_SPEECH[value];
}

// ─── Register ────────────────────────────────────────────────────────────────
// Prisma stores UPPER_CASE; domain uses lowercase.

const PRISMA_TO_DOMAIN_REGISTER: Record<$Enums.Register, Register> = {
  FORMAL: Register.FORMAL,
  INFORMAL: Register.INFORMAL,
  NEUTRAL: Register.NEUTRAL,
  COLLOQUIAL: Register.COLLOQUIAL,
  SLANG: Register.SLANG,
  ARCHAIC: Register.ARCHAIC,
  DIALECT: Register.DIALECT,
};

const DOMAIN_TO_PRISMA_REGISTER: Record<Register, $Enums.Register> = {
  [Register.FORMAL]: 'FORMAL',
  [Register.INFORMAL]: 'INFORMAL',
  [Register.NEUTRAL]: 'NEUTRAL',
  [Register.COLLOQUIAL]: 'COLLOQUIAL',
  [Register.SLANG]: 'SLANG',
  [Register.ARCHAIC]: 'ARCHAIC',
  [Register.DIALECT]: 'DIALECT',
};

export function prismaRegisterToDomain(value: $Enums.Register): Register {
  return PRISMA_TO_DOMAIN_REGISTER[value];
}

export function domainRegisterToPrisma(value: Register): $Enums.Register {
  return DOMAIN_TO_PRISMA_REGISTER[value];
}
