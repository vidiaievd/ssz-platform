import { $Enums } from '../../../../../../generated/prisma/client.js';
import { GrammarTopic } from '../../../domain/value-objects/grammar-topic.vo.js';
import { AtomTrack } from '../../../domain/value-objects/atom-track.vo.js';
import { VariantStatus } from '../../../../lesson/domain/value-objects/variant-status.vo.js';

// DifficultyLevel and Visibility conversions are defined in the container module.
export {
  prismaDifficultyToDomain,
  domainDifficultyToPrisma,
  prismaVisibilityToDomain,
  domainVisibilityToPrisma,
} from '../../../../container/infrastructure/persistence/mappers/enum-converters.js';

// VariantStatus conversions are defined in the lesson module.
export {
  prismaVariantStatusToDomain,
  domainVariantStatusToPrisma,
} from '../../../../lesson/infrastructure/persistence/mappers/enum-converters.js';

// ─── GrammarTopic ─────────────────────────────────────────────────────────────

const PRISMA_TO_DOMAIN_GRAMMAR_TOPIC: Record<$Enums.GrammarTopic, GrammarTopic> = {
  VERBS: GrammarTopic.VERBS,
  NOUNS: GrammarTopic.NOUNS,
  ADJECTIVES: GrammarTopic.ADJECTIVES,
  ADVERBS: GrammarTopic.ADVERBS,
  PRONOUNS: GrammarTopic.PRONOUNS,
  ARTICLES: GrammarTopic.ARTICLES,
  PREPOSITIONS: GrammarTopic.PREPOSITIONS,
  CONJUNCTIONS: GrammarTopic.CONJUNCTIONS,
  WORD_ORDER: GrammarTopic.WORD_ORDER,
  TENSES: GrammarTopic.TENSES,
  CASES: GrammarTopic.CASES,
  MOOD: GrammarTopic.MOOD,
  VOICE: GrammarTopic.VOICE,
  NUMERALS: GrammarTopic.NUMERALS,
  OTHER: GrammarTopic.OTHER,
};

const DOMAIN_TO_PRISMA_GRAMMAR_TOPIC: Record<GrammarTopic, $Enums.GrammarTopic> = {
  [GrammarTopic.VERBS]: 'VERBS',
  [GrammarTopic.NOUNS]: 'NOUNS',
  [GrammarTopic.ADJECTIVES]: 'ADJECTIVES',
  [GrammarTopic.ADVERBS]: 'ADVERBS',
  [GrammarTopic.PRONOUNS]: 'PRONOUNS',
  [GrammarTopic.ARTICLES]: 'ARTICLES',
  [GrammarTopic.PREPOSITIONS]: 'PREPOSITIONS',
  [GrammarTopic.CONJUNCTIONS]: 'CONJUNCTIONS',
  [GrammarTopic.WORD_ORDER]: 'WORD_ORDER',
  [GrammarTopic.TENSES]: 'TENSES',
  [GrammarTopic.CASES]: 'CASES',
  [GrammarTopic.MOOD]: 'MOOD',
  [GrammarTopic.VOICE]: 'VOICE',
  [GrammarTopic.NUMERALS]: 'NUMERALS',
  [GrammarTopic.OTHER]: 'OTHER',
};

export function prismaGrammarTopicToDomain(value: $Enums.GrammarTopic): GrammarTopic {
  return PRISMA_TO_DOMAIN_GRAMMAR_TOPIC[value];
}

export function domainGrammarTopicToPrisma(value: GrammarTopic): $Enums.GrammarTopic {
  return DOMAIN_TO_PRISMA_GRAMMAR_TOPIC[value];
}

// Re-export VariantStatus type for convenience within this module.
export { VariantStatus };

// ─── AtomTrack ────────────────────────────────────────────────────────────────
//
// A Prisma enum carries member NAMES (`LEXIS`), not the `@map` values (`lexis`), so the
// domain's lowercase value cannot be handed to the client as-is: it type-checks and fails
// at runtime. These two tables are the only crossing point.

const PRISMA_TO_DOMAIN_ATOM_TRACK: Record<$Enums.AtomTrack, AtomTrack> = {
  LEXIS: AtomTrack.LEXIS,
  GRAMMAR: AtomTrack.GRAMMAR,
};

const DOMAIN_TO_PRISMA_ATOM_TRACK: Record<AtomTrack, $Enums.AtomTrack> = {
  [AtomTrack.LEXIS]: 'LEXIS',
  [AtomTrack.GRAMMAR]: 'GRAMMAR',
};

export function prismaAtomTrackToDomain(value: $Enums.AtomTrack): AtomTrack {
  return PRISMA_TO_DOMAIN_ATOM_TRACK[value];
}

export function domainAtomTrackToPrisma(value: AtomTrack): $Enums.AtomTrack {
  return DOMAIN_TO_PRISMA_ATOM_TRACK[value];
}

// Re-export for convenience within this module.
export { AtomTrack };
