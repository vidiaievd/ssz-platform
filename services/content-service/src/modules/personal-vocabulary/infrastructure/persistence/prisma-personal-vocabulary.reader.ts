import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { PartOfSpeech } from '../../../vocabulary/domain/value-objects/part-of-speech.vo.js';
import type {
  CatalogMatch,
  IPersonalVocabularyReader,
  ListWordsFilter,
  PersonalWordView,
} from '../../domain/repositories/personal-vocabulary.reader.interface.js';

interface CatalogRow {
  id: string;
  word: string;
  // Raw SQL hands back the database label ('noun'), which is the domain value — not the
  // Prisma member name a typed query would return.
  part_of_speech: string | null;
  grammatical_properties: Record<string, unknown> | null;
  translation: string | null;
}

interface WordRow {
  entry_id: string;
  vocabulary_item_id: string;
  target_language: string;
  word: string;
  surface_form: string;
  part_of_speech: string | null;
  translation: string | null;
  own_word: boolean;
  context_sentence: string | null;
  source_variant_id: string | null;
  source_paragraph: number | null;
  source_char_start: number | null;
  deck_list_id: string | null;
  deck_title: string | null;
  created_at: Date;
}

@Injectable()
export class PrismaPersonalVocabularyReader implements IPersonalVocabularyReader {
  constructor(private readonly prisma: PrismaService) {}

  async findCatalogMatch(
    matchKey: string,
    targetLanguage: string,
    translationLanguage: string,
    userId: string,
  ): Promise<CatalogMatch | null> {
    // Forms live as string values of grammatical_properties, some holding alternatives
    // («blått/blå»); split the same way the reader's glossary tokenizer does. Gender and
    // verb class are labels, not forms — «strong» is no Norwegian word to match. A thousand
    // or so catalogue items make an index on this pointless for now.
    const rows = await this.prisma.$queryRaw<CatalogRow[]>`
      SELECT i.id, i.word, i.part_of_speech::text AS part_of_speech,
             i.grammatical_properties, t.primary_translation AS translation
        FROM vocabulary_items i
        JOIN vocabulary_lists l ON l.id = i.vocabulary_list_id
        LEFT JOIN vocabulary_item_translations t
               ON t.vocabulary_item_id = i.id AND t.translation_language = ${translationLanguage}
       WHERE i.deleted_at IS NULL
         AND l.deleted_at IS NULL
         AND l.target_language = ${targetLanguage}
         AND (l.visibility <> 'private' OR l.owner_user_id = ${userId}::uuid)
         AND NOT EXISTS (SELECT 1 FROM personal_vocabulary_lists p WHERE p.vocabulary_list_id = l.id)
         AND (
               lower(i.word) = ${matchKey}
            OR (jsonb_typeof(i.grammatical_properties) = 'object' AND EXISTS (
                  SELECT 1 FROM jsonb_each_text(i.grammatical_properties) g
                   WHERE g.key NOT IN ('gender', 'verb_class')
                     AND ${matchKey} = ANY (regexp_split_to_array(lower(g.value), '\\s*[/,;]\\s*'))))
         )
       ORDER BY (lower(i.word) = ${matchKey}) DESC,
                (t.primary_translation IS NOT NULL) DESC,
                i.created_at ASC
       LIMIT 1`;

    const row = rows[0];
    if (!row) return null;
    return {
      itemId: row.id,
      word: row.word,
      partOfSpeech: row.part_of_speech as PartOfSpeech | null,
      grammaticalProperties: row.grammatical_properties,
      translation: row.translation,
    };
  }

  async findListItemId(vocabularyListId: string, word: string): Promise<string | null> {
    const raw = await this.prisma.vocabularyItem.findFirst({
      where: { vocabularyListId, word, deletedAt: null },
      select: { id: true },
    });
    return raw?.id ?? null;
  }

  async listWords(userId: string, filter: ListWordsFilter): Promise<PersonalWordView[]> {
    if (filter.entryIds !== undefined && filter.entryIds.length === 0) return [];

    const conditions = [Prisma.sql`e.user_id = ${userId}::uuid`];
    if (filter.targetLanguage !== undefined) {
      conditions.push(Prisma.sql`e.target_language = ${filter.targetLanguage}`);
    }
    if (filter.entryIds !== undefined) {
      conditions.push(Prisma.sql`e.id = ANY (${filter.entryIds}::uuid[])`);
    }

    const rows = await this.prisma.$queryRaw<WordRow[]>`
      SELECT e.id AS entry_id, e.vocabulary_item_id, e.target_language, i.word, e.surface_form,
             i.part_of_speech::text AS part_of_speech, t.primary_translation AS translation,
             (p.user_id IS NOT NULL) AS own_word,
             e.context_sentence, e.source_variant_id, e.source_paragraph, e.source_char_start,
             deck.list_id AS deck_list_id, deck.title AS deck_title,
             e.created_at
        FROM personal_vocabulary_entries e
        JOIN vocabulary_items i ON i.id = e.vocabulary_item_id
        LEFT JOIN vocabulary_item_translations t
               ON t.vocabulary_item_id = i.id AND t.translation_language = ${filter.translationLanguage}
        LEFT JOIN personal_vocabulary_lists p
               ON p.vocabulary_list_id = i.vocabulary_list_id AND p.user_id = e.user_id
        -- The deck the word joins (D7): the first vocabulary list of the module its source
        -- lesson sits in, by the same rule as listItemIdsForModuleList. The published
        -- version names it when there is one, the newest draft otherwise.
        LEFT JOIN LATERAL (
          SELECT l.id AS list_id, l.title
            FROM lesson_content_variants v
            JOIN container_items li ON li.item_type = 'lesson' AND li.item_id = v.lesson_id
            JOIN container_versions cv
              ON cv.id = li.container_version_id AND cv.status <> 'archived'
            JOIN LATERAL (
                   SELECT ci.item_id
                     FROM container_items ci
                    WHERE ci.container_version_id = cv.id AND ci.item_type = 'vocabulary_list'
                    ORDER BY ci.position
                    LIMIT 1
                 ) first_list ON true
            JOIN vocabulary_lists l ON l.id = first_list.item_id AND l.deleted_at IS NULL
           WHERE v.id = e.source_variant_id
           ORDER BY (cv.status = 'published') DESC, cv.version_number DESC
           LIMIT 1
        ) deck ON true
       WHERE ${Prisma.join(conditions, ' AND ')}
       ORDER BY e.created_at DESC, e.id`;

    return rows.map((r) => ({
      entryId: r.entry_id,
      vocabularyItemId: r.vocabulary_item_id,
      targetLanguage: r.target_language,
      word: r.word,
      surfaceForm: r.surface_form,
      partOfSpeech: r.part_of_speech as PartOfSpeech | null,
      translation: r.translation,
      ownWord: r.own_word,
      contextSentence: r.context_sentence,
      sourceVariantId: r.source_variant_id,
      sourceParagraph: r.source_paragraph,
      sourceCharStart: r.source_char_start,
      deck: r.deck_list_id ? { vocabularyListId: r.deck_list_id, title: r.deck_title ?? '' } : null,
      createdAt: r.created_at,
    }));
  }

  async listItemIdsForModuleList(userId: string, vocabularyListId: string): Promise<string[]> {
    // A module may hold several lists (Leksjon 17 has four); only the first takes the
    // student's words, or one word would turn up in every deck of the module.
    const rows = await this.prisma.$queryRaw<{ vocabulary_item_id: string }[]>`
      SELECT e.vocabulary_item_id
        FROM personal_vocabulary_entries e
        JOIN lesson_content_variants v ON v.id = e.source_variant_id
        JOIN container_items li ON li.item_type = 'lesson' AND li.item_id = v.lesson_id
        JOIN container_versions cv ON cv.id = li.container_version_id AND cv.status <> 'archived'
       WHERE e.user_id = ${userId}::uuid
         AND (SELECT ci.item_id
                FROM container_items ci
               WHERE ci.container_version_id = cv.id AND ci.item_type = 'vocabulary_list'
               ORDER BY ci.position
               LIMIT 1) = ${vocabularyListId}::uuid
       GROUP BY e.vocabulary_item_id
       ORDER BY min(e.created_at), e.vocabulary_item_id`;
    return rows.map((r) => r.vocabulary_item_id);
  }
}
