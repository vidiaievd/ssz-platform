import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { GetGlossarySuggestionsQuery } from './get-glossary-suggestions.query.js';

export type MatchKind = 'exact' | 'fuzzy';

export interface GlossarySuggestion {
  vocabItemId: string;
  vocabListId: string;
  word: string;
  matchKind: MatchKind;
  matchSnippet: string;
}

@QueryHandler(GetGlossarySuggestionsQuery)
export class GetGlossarySuggestionsHandler
  implements IQueryHandler<GetGlossarySuggestionsQuery, GlossarySuggestion[]>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetGlossarySuggestionsQuery): Promise<GlossarySuggestion[]> {
    // 1. Load the lesson entity.
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: query.lessonId, deletedAt: null },
      select: { id: true, ownerSchoolId: true },
    });
    if (!lesson) throw new NotFoundException(`Lesson ${query.lessonId} not found`);

    // 2. Find the module container that owns this lesson.
    const moduleItem = await this.prisma.containerItem.findFirst({
      where: { itemType: 'LESSON', itemId: query.lessonId },
      include: { containerVersion: { select: { containerId: true } } },
    });
    if (!moduleItem) return [];

    const moduleId = moduleItem.containerVersion.containerId;

    // 3. Get the module's current published version items to find vocab lists.
    const moduleContainer = await this.prisma.container.findUnique({
      where: { id: moduleId },
      select: { currentPublishedVersionId: true },
    });
    const versionId = moduleContainer?.currentPublishedVersionId;

    let vocabListIds: string[] = [];
    if (versionId) {
      const vocabItems = await this.prisma.containerItem.findMany({
        where: { containerVersionId: versionId, itemType: 'VOCABULARY_LIST' },
        select: { itemId: true },
      });
      vocabListIds = vocabItems.map((v) => v.itemId);
    }
    if (vocabListIds.length === 0) return [];

    // 4. Get the lesson's latest variant bodyMarkdown.
    const variant = await this.prisma.lessonContentVariant.findFirst({
      where: {
        lessonId: query.lessonId,
        deletedAt: null,
        status: 'PUBLISHED',
        explanationLanguage: query.language,
      },
      orderBy: { publishedAt: 'desc' },
      select: { bodyMarkdown: true },
    });
    const text = variant?.bodyMarkdown ?? '';

    // 5. Load all vocab items from those lists.
    const vocabItems = await this.prisma.vocabularyItem.findMany({
      where: { vocabularyListId: { in: vocabListIds }, deletedAt: null },
      select: { id: true, vocabularyListId: true, word: true },
    });

    // 6. Find already-linked items (INTRODUCES relations from this lesson or module).
    const existingRelations = await this.prisma.contentRelation.findMany({
      where: {
        sourceId: { in: [query.lessonId, moduleId] },
        sourceType: { in: ['LESSON', 'CONTAINER'] },
        relationKind: 'INTRODUCES',
        targetType: 'VOCABULARY_ITEM',
      },
      select: { targetId: true },
    });
    const alreadyLinked = new Set(existingRelations.map((r) => r.targetId));

    // 7. Match vocab words against the lesson text.
    const lowerText = text.toLowerCase();
    const suggestions: GlossarySuggestion[] = [];

    for (const item of vocabItems) {
      if (alreadyLinked.has(item.id)) continue;

      const lowerWord = item.word.toLowerCase();

      // Exact word-boundary match.
      const exactPattern = new RegExp(`\\b${escapeRegex(lowerWord)}\\b`);
      if (exactPattern.test(lowerText)) {
        const snippet = extractSnippet(lowerText, lowerWord);
        suggestions.push({
          vocabItemId: item.id,
          vocabListId: item.vocabularyListId,
          word: item.word,
          matchKind: 'exact',
          matchSnippet: snippet,
        });
        continue;
      }

      // Light fuzzy: word appears as a substring (handles inflected forms without NLP).
      if (lowerWord.length >= 4 && lowerText.includes(lowerWord)) {
        const snippet = extractSnippet(lowerText, lowerWord);
        suggestions.push({
          vocabItemId: item.id,
          vocabListId: item.vocabularyListId,
          word: item.word,
          matchKind: 'fuzzy',
          matchSnippet: snippet,
        });
      }
    }

    return suggestions;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSnippet(text: string, word: string, radius = 40): string {
  const idx = text.indexOf(word);
  if (idx === -1) return '';
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + word.length + radius);
  const snippet = text.slice(start, end);
  return (start > 0 ? '…' : '') + snippet + (end < text.length ? '…' : '');
}
