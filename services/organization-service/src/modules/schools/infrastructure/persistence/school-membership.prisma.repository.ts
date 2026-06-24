import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { SchoolMembership } from '../../domain/entities/school-membership.entity.js';
import type {
  MembershipSource,
  MembershipStatus,
} from '../../domain/entities/school-membership.entity.js';
import type { ISchoolMembershipRepository, ListMembershipsOptions } from '../../domain/repositories/school-membership.repository.interface.js';

const PAGE_SIZE = 50;

// Domain values use dash-case (matches the DB column via Prisma's @map), but
// the Prisma *client* enum identifiers are snake_case — so reads/writes must
// translate through these tables rather than passing the domain string straight through.
const SOURCE_TO_DB: Record<MembershipSource, string> = {
  'public-apply': 'public_apply',
  invite: 'invite',
  direct: 'direct',
};
const SOURCE_FROM_DB: Record<string, MembershipSource> = {
  public_apply: 'public-apply',
  invite: 'invite',
  direct: 'direct',
};
const STATUS_TO_DB: Record<MembershipStatus, string> = {
  pending: 'pending',
  onboarding: 'onboarding',
  'placement-review': 'placement_review',
  active: 'active',
  rejected: 'rejected',
  left: 'left',
};
const STATUS_FROM_DB: Record<string, MembershipStatus> = {
  pending: 'pending',
  onboarding: 'onboarding',
  placement_review: 'placement-review',
  active: 'active',
  rejected: 'rejected',
  left: 'left',
};

function rowToEntity(row: any): SchoolMembership {
  return SchoolMembership.rehydrate({
    id: row.id,
    schoolId: row.schoolId,
    studentId: row.studentId,
    status: STATUS_FROM_DB[row.status],
    source: SOURCE_FROM_DB[row.source],
    language: row.language ?? undefined,
    availability: row.availability ?? undefined,
    ageBand: row.ageBand ?? undefined,
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
        status: STATUS_TO_DB[membership.status],
        source: SOURCE_TO_DB[membership.source],
        language: membership.language ?? null,
        availability: membership.availability ?? null,
        ageBand: membership.ageBand ?? null,
        createdAt: membership.createdAt,
        updatedAt: membership.updatedAt,
      },
      update: {
        status: STATUS_TO_DB[membership.status],
        availability: membership.availability ?? null,
        ageBand: membership.ageBand ?? null,
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
    if (options.status) where.status = STATUS_TO_DB[options.status];
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
