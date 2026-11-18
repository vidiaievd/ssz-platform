import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { GetUserContactQuery } from './get-user-contact.query.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';

/** How to reach a user: the address the platform writes to and the language they read it in. */
export interface UserContact {
  userId: string;
  email: string;
  displayName: string | null;
  uiLocale: string | null;
}

/**
 * Reads the email projection (built from `auth.user.registered`) and the profile's UI locale.
 * `null` when the user has no address on record (deleted or never projected).
 */
@QueryHandler(GetUserContactQuery)
export class GetUserContactHandler implements IQueryHandler<GetUserContactQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetUserContactQuery): Promise<UserContact | null> {
    const entry = await (this.prisma as any).userEmailIndex.findUnique({
      where: { userId: query.userId },
      select: { email: true },
    });
    if (!entry) return null;

    const profile = await (this.prisma as any).profile.findFirst({
      where: { userId: query.userId, deletedAt: null },
      select: { displayName: true, uiLocale: true },
    });

    return {
      userId: query.userId,
      email: entry.email,
      displayName: profile?.displayName ?? null,
      uiLocale: profile?.uiLocale ?? null,
    };
  }
}
