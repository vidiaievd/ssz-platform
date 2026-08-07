import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { GetContainerActivityQuery } from './get-container-activity.query.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import type { AuditEntityType } from '../../../../../shared/application/ports/audit-log.port.js';

export interface ContainerActivityEntry {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  /** Resolved at read time, so a renamed lesson reads under its current name. */
  entityTitle: string | null;
  action: string;
  actorUserId: string;
  changedFields: string[];
  occurredAt: Date;
}

export interface ContainerActivityResult {
  entries: ContainerActivityEntry[];
  hasMore: boolean;
}

/**
 * The history of one container: what happened to it, and to the material it
 * places.
 *
 * Entries are not stamped with a container id when written, because an exercise
 * belongs to every module that places it — so the container's reach is resolved
 * here instead. That also means an item keeps its history when it moves: the
 * feed follows placement as it is *now*, which is the question the author is
 * asking when they open the panel.
 */
@QueryHandler(GetContainerActivityQuery)
export class GetContainerActivityHandler implements IQueryHandler<
  GetContainerActivityQuery,
  ContainerActivityResult
> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetContainerActivityQuery): Promise<ContainerActivityResult> {
    const itemIds = await this.placedEntityIds(query.containerId);

    // One extra row answers "is there a next page" without a second count query.
    const rows = await this.prisma.contentAuditLog.findMany({
      where: {
        OR: [
          { entityType: 'CONTAINER', entityId: query.containerId },
          { entityId: { in: itemIds } },
        ],
        ...(query.before ? { occurredAt: { lt: query.before } } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: query.limit + 1,
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const titles = await this.resolveTitles(page.map((r) => r.entityId));

    return {
      entries: page.map((row) => ({
        id: row.id,
        entityType: row.entityType,
        entityId: row.entityId,
        entityTitle: titles.get(row.entityId) ?? null,
        action: row.action,
        actorUserId: row.actorUserId,
        changedFields: row.changedFields,
        occurredAt: row.occurredAt,
      })),
      hasMore,
    };
  }

  /**
   * Everything the container's versions place, across every version rather than
   * only the live one: an entry about material that has since been removed is
   * still part of how this container got to where it is.
   */
  private async placedEntityIds(containerId: string): Promise<string[]> {
    const versions = await this.prisma.containerVersion.findMany({
      where: { containerId },
      select: { id: true },
    });
    if (versions.length === 0) return [];

    const items = await this.prisma.containerItem.findMany({
      where: { containerVersionId: { in: versions.map((v) => v.id) } },
      select: { itemId: true },
    });

    return [...new Set(items.map((i) => i.itemId))];
  }

  /**
   * Display names for the entities on this page, one query per kind. Exercises
   * have no title of their own and read under their template's name, exactly as
   * the curriculum tree shows them.
   */
  private async resolveTitles(entityIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(entityIds)];
    const titles = new Map<string, string>();
    if (ids.length === 0) return titles;

    const [containers, lessons, vocabularyLists, grammarRules, exercises] = await Promise.all([
      this.prisma.container.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true },
      }),
      this.prisma.lesson.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true },
      }),
      this.prisma.vocabularyList.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true },
      }),
      this.prisma.grammarRule.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true },
      }),
      this.prisma.exercise.findMany({
        where: { id: { in: ids } },
        select: { id: true, template: { select: { name: true } } },
      }),
    ]);

    for (const row of [...containers, ...lessons, ...vocabularyLists, ...grammarRules]) {
      titles.set(row.id, row.title);
    }
    for (const row of exercises) {
      if (row.template.name) titles.set(row.id, row.template.name);
    }

    return titles;
  }
}
