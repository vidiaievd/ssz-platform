import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  CourseDictionaryEntry,
  CourseDictionaryOptions,
  ICourseDictionaryReader,
} from '../../domain/repositories/course-dictionary.reader.interface.js';

/** A vocabulary list as it stands in the walk: which list, and under what heading. */
interface PlacedList {
  listId: string;
  unit: string;
}

/**
 * Walks exercise → its containers → their course(s) → modules → vocabulary lists → words.
 *
 * Every container is read at the version the editor shows: its draft, or its published version
 * when it has no draft — the same fallback the coverage report uses, because an untouched module
 * has no draft and is still part of the course (memory `module-versions-three-readers`).
 *
 * Which course: every course whose chosen version places a module holding the exercise, or holds
 * the exercise itself. An exercise in a module that no course places reads that module's lists
 * alone — a dictionary of the nearest thing to a course there is. One level of nesting, as the
 * structure editor builds it (course → module); a module inside a module is not walked.
 */
@Injectable()
export class PrismaCourseDictionaryReader implements ICourseDictionaryReader {
  constructor(private readonly prisma: PrismaService) {}

  async forExercise(
    exerciseId: string,
    options: CourseDictionaryOptions,
  ): Promise<CourseDictionaryEntry[]> {
    const lists = await this.listsOf(exerciseId);
    if (lists.length === 0) return [];

    const unitOf = new Map<string, string>();
    for (const list of lists) if (!unitOf.has(list.listId)) unitOf.set(list.listId, list.unit);
    const order = [...unitOf.keys()];

    const words = await this.prisma.vocabularyItem.findMany({
      where: {
        vocabularyListId: { in: order },
        deletedAt: null,
        vocabularyList: { deletedAt: null },
        // Prisma takes and returns the member NAME (`NOUN`), not the @map value
        // (memory `prisma-mapped-enum-trap`).
        ...(options.pos ? { partOfSpeech: options.pos } : {}),
      },
      select: {
        id: true,
        word: true,
        vocabularyListId: true,
        position: true,
        partOfSpeech: true,
        grammaticalProperties: true,
        translations: {
          select: { translationLanguage: true, primaryTranslation: true },
          orderBy: { translationLanguage: 'asc' },
        },
      },
    });

    // Course order: list by list as the walk met them, word by word within a list.
    const rank = new Map(order.map((id, i) => [id, i]));
    words.sort(
      (a, b) =>
        (rank.get(a.vocabularyListId) ?? 0) - (rank.get(b.vocabularyListId) ?? 0) ||
        a.position - b.position,
    );

    return words.map((w) => ({
      id: w.id,
      word: w.word,
      pos: w.partOfSpeech ?? '',
      gloss: glossOf(w.translations, options.glossLanguage),
      unit: unitOf.get(w.vocabularyListId) ?? '',
      properties: asRecord(w.grammaticalProperties),
    }));
  }

  /** Every vocabulary list of the exercise's course(s), in course order, each under its unit. */
  private async listsOf(exerciseId: string): Promise<PlacedList[]> {
    const placements = await this.prisma.containerItem.findMany({
      where: { itemType: 'EXERCISE', itemId: exerciseId },
      select: {
        containerVersion: {
          select: { container: { select: { id: true, containerType: true, deletedAt: true } } },
        },
      },
    });
    const holders = new Map<string, string>();
    for (const p of placements) {
      const c = p.containerVersion.container;
      if (c.deletedAt === null) holders.set(c.id, c.containerType);
    }
    if (holders.size === 0) return [];

    const courses = new Set<string>();
    const lonelyModules: string[] = [];
    for (const [id, type] of holders) {
      // Only where the exercise still stands: an old version of a module it has since left
      // must not pull that module's course in.
      if (!(await this.holds(id, exerciseId))) continue;
      if (type === 'COURSE') {
        courses.add(id);
        continue;
      }
      const placing = await this.coursesPlacing(id);
      if (placing.length === 0) lonelyModules.push(id);
      for (const courseId of placing) courses.add(courseId);
    }

    const out: PlacedList[] = [];
    for (const courseId of courses) out.push(...(await this.listsOfCourse(courseId)));
    for (const moduleId of lonelyModules) out.push(...(await this.listsOfModule(moduleId, '')));
    return out;
  }

  /** Courses whose chosen version places this module. */
  private async coursesPlacing(moduleId: string): Promise<string[]> {
    const refs = await this.prisma.containerItem.findMany({
      where: { itemType: 'CONTAINER', itemId: moduleId },
      select: {
        containerVersionId: true,
        containerVersion: {
          select: { container: { select: { id: true, containerType: true, deletedAt: true } } },
        },
      },
    });
    const out: string[] = [];
    for (const ref of refs) {
      const course = ref.containerVersion.container;
      if (course.containerType !== 'COURSE' || course.deletedAt !== null) continue;
      // A reference from an old version of the course does not make it this module's course.
      if ((await this.versionOf(course.id)) !== ref.containerVersionId) continue;
      if (!out.includes(course.id)) out.push(course.id);
    }
    return out;
  }

  /** Whether the chosen version of a container places this item directly. */
  private async holds(containerId: string, itemId: string): Promise<boolean> {
    const versionId = await this.versionOf(containerId);
    if (versionId === null) return false;
    const found = await this.prisma.containerItem.findFirst({
      where: { containerVersionId: versionId, itemId },
      select: { id: true },
    });
    return found !== null;
  }

  private async listsOfCourse(courseId: string): Promise<PlacedList[]> {
    const versionId = await this.versionOf(courseId);
    if (versionId === null) return [];

    const items = await this.prisma.containerItem.findMany({
      where: { containerVersionId: versionId, itemType: { in: ['CONTAINER', 'VOCABULARY_LIST'] } },
      select: {
        itemType: true,
        itemId: true,
        position: true,
        section: { select: { title: true, position: true } },
      },
    });
    // Sections first, in their order; unsectioned items after them, as the editor draws them.
    items.sort(
      (a, b) =>
        (a.section?.position ?? Number.MAX_SAFE_INTEGER) -
          (b.section?.position ?? Number.MAX_SAFE_INTEGER) || a.position - b.position,
    );

    const modules = await this.prisma.container.findMany({
      where: {
        id: { in: items.filter((i) => i.itemType === 'CONTAINER').map((i) => i.itemId) },
        deletedAt: null,
      },
      select: { id: true, title: true },
    });
    const titleOf = new Map(modules.map((m) => [m.id, m.title]));

    const out: PlacedList[] = [];
    for (const item of items) {
      const section = item.section?.title ?? '';
      if (item.itemType === 'VOCABULARY_LIST') {
        out.push({ listId: item.itemId, unit: section });
        continue;
      }
      const title = titleOf.get(item.itemId);
      if (title === undefined) continue;
      out.push(...(await this.listsOfModule(item.itemId, joinUnit(section, title))));
    }
    return out;
  }

  private async listsOfModule(moduleId: string, unit: string): Promise<PlacedList[]> {
    const versionId = await this.versionOf(moduleId);
    if (versionId === null) return [];
    const label =
      unit !== ''
        ? unit
        : ((
            await this.prisma.container.findFirst({
              where: { id: moduleId },
              select: { title: true },
            })
          )?.title ?? '');
    const items = await this.prisma.containerItem.findMany({
      where: { containerVersionId: versionId, itemType: 'VOCABULARY_LIST' },
      select: { itemId: true },
      orderBy: { position: 'asc' },
    });
    return items.map((i) => ({ listId: i.itemId, unit: label }));
  }

  /** The draft version, else the published one; `null` for a deleted or versionless container. */
  private async versionOf(containerId: string): Promise<string | null> {
    const container = await this.prisma.container.findFirst({
      where: { id: containerId, deletedAt: null },
      select: { currentPublishedVersionId: true },
    });
    if (!container) return null;
    const draft = await this.prisma.containerVersion.findFirst({
      where: { containerId, status: 'DRAFT' },
      orderBy: [{ versionNumber: 'desc' }],
      select: { id: true },
    });
    return draft?.id ?? container.currentPublishedVersionId;
  }
}

function joinUnit(section: string, module: string): string {
  return section !== '' ? `${section} · ${module}` : module;
}

function glossOf(
  translations: Array<{ translationLanguage: string; primaryTranslation: string }>,
  language: string | undefined,
): string {
  const pick =
    (language ? translations.find((t) => t.translationLanguage === language) : undefined) ??
    translations.find((t) => t.translationLanguage === 'en') ??
    translations[0];
  return pick?.primaryTranslation ?? '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
