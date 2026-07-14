import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { ISchoolRepository, PublicSchoolDetail, PublicSchoolFilter, PublicSchoolPage } from '../../domain/repositories/school.repository.interface.js';
import type { School } from '../../domain/entities/school.entity.js';
import { SchoolMapper } from './school.mapper.js';

const INCLUDE_MEMBERS = { members: true } as const;

@Injectable()
export class SchoolPrismaRepository implements ISchoolRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<School | null> {
    const raw = await (this.prisma as any).school.findUnique({
      where: { id },
      include: INCLUDE_MEMBERS,
    });
    return raw ? SchoolMapper.toDomain(raw) : null;
  }

  async findBySlug(slug: string): Promise<School | null> {
    const raw = await (this.prisma as any).school.findFirst({
      where: { slug, deletedAt: null },
      include: INCLUDE_MEMBERS,
    });
    return raw ? SchoolMapper.toDomain(raw) : null;
  }

  async findByName(name: string): Promise<School | null> {
    const raw = await (this.prisma as any).school.findFirst({
      where: { name, deletedAt: null },
      include: INCLUDE_MEMBERS,
    });
    return raw ? SchoolMapper.toDomain(raw) : null;
  }

  async findByOwnerId(ownerId: string): Promise<School[]> {
    const rows = await (this.prisma as any).school.findMany({
      where: { ownerId, deletedAt: null },
      include: INCLUDE_MEMBERS,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(SchoolMapper.toDomain);
  }

  async findMemberSchools(userId: string): Promise<School[]> {
    const rows = await (this.prisma as any).school.findMany({
      where: {
        deletedAt: null,
        members: { some: { userId } },
      },
      include: INCLUDE_MEMBERS,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(SchoolMapper.toDomain);
  }

  async findAllActive(): Promise<School[]> {
    const rows = await (this.prisma as any).school.findMany({
      where: { deletedAt: null, isActive: true },
      include: INCLUDE_MEMBERS,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(SchoolMapper.toDomain);
  }

  async findPublicFiltered(filter: PublicSchoolFilter): Promise<PublicSchoolPage> {
    const { q, type, cursor, limit } = filter;

    let cursorDecoded: { name: string; id: string } | null = null;
    if (cursor) {
      try {
        cursorDecoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      } catch {
        // invalid cursor — ignored, treated as first page
      }
    }

    const baseConditions: any[] = [{ deletedAt: null, isActive: true }];
    if (type) baseConditions.push({ type });
    if (q) {
      baseConditions.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { city: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    const countWhere = { AND: baseConditions };

    const pageConditions = [...baseConditions];
    if (cursorDecoded) {
      pageConditions.push({
        OR: [
          { name: { gt: cursorDecoded.name } },
          { AND: [{ name: cursorDecoded.name }, { id: { gt: cursorDecoded.id } }] },
        ],
      });
    }
    const pageWhere = { AND: pageConditions };

    const [total, rawItems] = await Promise.all([
      (this.prisma as any).school.count({ where: countWhere }),
      (this.prisma as any).school.findMany({
        where: pageWhere,
        include: INCLUDE_MEMBERS,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: limit + 1,
      }),
    ]);

    const hasNextPage = rawItems.length > limit;
    const pageItems: typeof rawItems = hasNextPage ? rawItems.slice(0, limit) : rawItems;

    const lastItem = pageItems.at(-1);
    const endCursor = lastItem
      ? Buffer.from(JSON.stringify({ name: lastItem.name, id: lastItem.id }), 'utf8').toString('base64url')
      : null;

    return {
      items: pageItems.map(SchoolMapper.toDomain),
      total,
      endCursor,
      hasNextPage,
    };
  }

  async findPublicSchoolDetail(slug: string): Promise<PublicSchoolDetail | null> {
    const raw = await (this.prisma as any).school.findFirst({
      where: { slug, deletedAt: null, isActive: true },
      include: {
        members: true,
        groups: {
          where: { deletedAt: null, status: 'active' },
          select: { level: true },
        },
      },
    });

    if (!raw) return null;

    const teacherMembers: { userId: string; name: string | null; avatarUrl: string | null }[] = [];
    let studentCount = 0;

    for (const m of raw.members as any[]) {
      if (m.role === 'STUDENT') {
        studentCount++;
      } else if (m.role === 'TEACHER') {
        teacherMembers.push({ userId: m.userId, name: m.name ?? null, avatarUrl: m.avatarUrl ?? null });
      }
    }

    const levels = Array.from(
      new Set((raw.groups as any[]).map((g: any) => g.level).filter(Boolean)),
    ).sort() as string[];

    return {
      school: SchoolMapper.toDomain(raw),
      studentCount,
      levels,
      teachers: teacherMembers,
    };
  }

  async findManagerCapabilities(userId: string, schoolIds: string[]): Promise<Map<string, string[]>> {
    if (schoolIds.length === 0) return new Map();
    const rows = await (this.prisma as any).schoolMemberPermission.findMany({
      where: { userId, schoolId: { in: schoolIds } },
      select: { schoolId: true, capabilities: true },
    });
    return new Map(rows.map((r: any) => [r.schoolId as string, r.capabilities as string[]]));
  }

  async save(school: School): Promise<void> {
    await (this.prisma as any).$transaction(async (tx: any) => {
      await tx.school.upsert({
        where: { id: school.id },
        create: {
          id: school.id,
          name: school.name,
          slug: school.slug,
          description: school.description ?? null,
          ownerId: school.ownerId,
          avatarUrl: school.avatarUrl ?? null,
          website: school.website ?? null,
          contactEmail: school.contactEmail ?? null,
          city: school.city ?? null,
          type: school.type,
          isActive: school.isActive,
          requireTutorReviewForSelfPaced: school.requireTutorReviewForSelfPaced,
          defaultExplanationLanguage: school.defaultExplanationLanguage ?? null,
          createdAt: school.createdAt,
          updatedAt: school.updatedAt,
          deletedAt: school.deletedAt ?? null,
        },
        update: {
          name: school.name,
          slug: school.slug,
          description: school.description ?? null,
          avatarUrl: school.avatarUrl ?? null,
          website: school.website ?? null,
          contactEmail: school.contactEmail ?? null,
          city: school.city ?? null,
          type: school.type,
          isActive: school.isActive,
          requireTutorReviewForSelfPaced: school.requireTutorReviewForSelfPaced,
          defaultExplanationLanguage: school.defaultExplanationLanguage ?? null,
          updatedAt: school.updatedAt,
          deletedAt: school.deletedAt ?? null,
        },
      });

      // Sync members: delete all and recreate from domain state
      await tx.schoolMember.deleteMany({ where: { schoolId: school.id } });

      const members = school.members;
      if (members.length > 0) {
        await tx.schoolMember.createMany({
          data: members.map((m) => ({
            id: m.id,
            schoolId: m.schoolId,
            userId: m.userId,
            role: m.role,
            joinedAt: m.joinedAt,
            name: m.name,
            avatarUrl: m.avatarUrl,
          })),
        });
      }
    });
  }
}
