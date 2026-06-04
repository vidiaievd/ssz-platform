import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { LookupUserByEmailQuery } from './lookup-user-by-email.query.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';

export interface UserLookupResult {
  userId: string;
  roles: string[];
  displayName?: string;
}

@QueryHandler(LookupUserByEmailQuery)
export class LookupUserByEmailHandler implements IQueryHandler<LookupUserByEmailQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: LookupUserByEmailQuery): Promise<UserLookupResult | null> {
    const entry = await (this.prisma as any).userEmailIndex.findUnique({
      where: { email: query.email },
    });
    if (!entry) return null;

    const profile = await (this.prisma as any).profile.findFirst({
      where: { userId: entry.userId, deletedAt: null },
      select: { displayName: true },
    });

    return {
      userId: entry.userId,
      roles: entry.roles,
      displayName: profile?.displayName,
    };
  }
}
