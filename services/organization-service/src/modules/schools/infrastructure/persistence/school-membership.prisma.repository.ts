import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { SchoolMembership } from '../../domain/entities/school-membership.entity.js';
import type { ISchoolMembershipRepository, ListMembershipsOptions } from '../../domain/repositories/school-membership.repository.interface.js';

const PAGE_SIZE = 50;

function rowToEntity(row: any): SchoolMembership {
  return SchoolMembership.rehydrate({
    id: row.id,
    schoolId: row.schoolId,
    studentId: row.studentId,
    status: row.status,
    source: row.source,
    language: row.language ?? undefined,
    availability: row.availability ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

@Injectable()
export class SchoolMembershipPrismaRepository implements ISchoolMembershipRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(membership: SchoolMembership): Promise<void> {
    await (this.prisma as any).schoolMembership.upsert({
      where: { id: membership.id },
      create: {
        id: membership.id,
        schoolId: membership.schoolId,
        studentId: membership.studentId,
        status: membership.status,
        source: membership.source,
        language: membership.language ?? null,
        availability: membership.availability ?? null,
        createdAt: membership.createdAt,
        updatedAt: membership.updatedAt,
      },
      update: {
        status: membership.status,
        availability: membership.availability ?? null,
        updatedAt: membership.updatedAt,
      },
    });
  }

  async findById(id: string): Promise<SchoolMembership | null> {
    const row = await (this.prisma as any).schoolMembership.findUnique({ where: { id } });
    return row ? rowToEntity(row) : null;
  }

  async findBySchoolAndStudent(schoolId: string, studentId: string): Promise<SchoolMembership | null> {
    const row = await (this.prisma as any).schoolMembership.findFirst({
      where: { schoolId, studentId },
      orderBy: { createdAt: 'desc' },
    });
    return row ? rowToEntity(row) : null;
  }

  async list(options: ListMembershipsOptions): Promise<{ items: SchoolMembership[]; nextCursor: string | null }> {
    const where: any = { schoolId: options.schoolId };
    if (options.status) where.status = options.status;
    if (options.cursor) where.id = { gt: options.cursor };

    const limit = options.limit ?? PAGE_SIZE;
    const rows = await (this.prisma as any).schoolMembership.findMany({
      where,
      take: limit + 1,
      orderBy: { createdAt: 'asc' },
    });

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(rowToEntity);
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }
}
