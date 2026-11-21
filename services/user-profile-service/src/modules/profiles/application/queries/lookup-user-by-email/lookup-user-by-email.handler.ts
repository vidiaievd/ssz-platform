import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { LookupUserByEmailQuery } from './lookup-user-by-email.query.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';

export interface UserLookupResult {
  userId: string;
  roles: string[];
  displayName?: string;
}

/**
 * The account behind an e-mail address, from the `user_email_index` projection. Served only to
 * other services (`internal/users/lookup`): organization answers staff of a school, content the
 * editor of a material (plan 90, session 16 remark 4). Addresses compare without case — auth keeps
 * the address as typed, and nobody types it back the same way.
 */
@QueryHandler(LookupUserByEmailQuery)
export class LookupUserByEmailHandler implements IQueryHandler<LookupUserByEmailQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: LookupUserByEmailQuery): Promise<UserLookupResult | null> {
    const email = query.email.trim();
    if (!email) return null;
    const entry = await (this.prisma as any).userEmailIndex.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
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
