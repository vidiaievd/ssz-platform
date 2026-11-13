import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { encodeCursor } from '../domain/admin-audit.js';
import type { AdminAuditCursor, AdminAuditFilter } from '../domain/admin-audit.js';
import type { AdminAuditEntryDto, AdminAuditPageDto } from '../dto/admin-audit.dto.js';
import { ListAdminAuditQuery } from './list-admin-audit.query.js';

/**
 * A page of the cross-service admin trail, newest first (plan 90, phase 1, step 6). Keyset
 * pagination on (occurredAt, id): rows filed while the admin pages through never shift a page.
 */
@QueryHandler(ListAdminAuditQuery)
@Injectable()
export class ListAdminAuditHandler implements IQueryHandler<ListAdminAuditQuery, AdminAuditPageDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListAdminAuditQuery): Promise<AdminAuditPageDto> {
    const rows = await this.prisma.adminAuditLog.findMany({
      where: whereOf(query.filter, query.cursor),
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });

    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    return {
      items: page.map(
        (row): AdminAuditEntryDto => ({
          id: row.id,
          service: row.service,
          occurredAt: row.occurredAt.toISOString(),
          actorId: row.actorId,
          actorLevel: row.actorLevel,
          action: row.action,
          targetType: row.targetType,
          targetId: row.targetId,
          reason: row.reason,
          before: (row.before as Record<string, unknown> | null) ?? null,
          after: (row.after as Record<string, unknown> | null) ?? null,
        }),
      ),
      nextCursor: rows.length > query.limit && last ? encodeCursor({ occurredAt: last.occurredAt, id: last.id }) : null,
    };
  }
}

export function whereOf(filter: AdminAuditFilter, cursor: AdminAuditCursor | null): Prisma.AdminAuditLogWhereInput {
  const and: Prisma.AdminAuditLogWhereInput[] = [];
  if (filter.service) and.push({ service: filter.service });
  if (filter.actorId) and.push({ actorId: filter.actorId });
  if (filter.targetType) and.push({ targetType: filter.targetType });
  if (filter.targetId) and.push({ targetId: filter.targetId });
  if (filter.from) and.push({ occurredAt: { gte: filter.from } });
  if (filter.to) and.push({ occurredAt: { lt: filter.to } });
  if (cursor) {
    and.push({
      OR: [
        { occurredAt: { lt: cursor.occurredAt } },
        { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
      ],
    });
  }
  return and.length > 0 ? { AND: and } : {};
}
