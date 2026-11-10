import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { IContentCleanupLock } from '../../application/ports/cleanup-lock.port.js';

/** Key of the cleanup's advisory lock. */
const CLEANUP_LOCK = 'content:obsolete-cleanup';

/** A Postgres advisory lock, as organization's lifecycle timer takes it. */
@Injectable()
export class ContentCleanupAdvisoryLock implements IContentCleanupLock {
  constructor(private readonly prisma: PrismaService) {}

  async run(work: () => Promise<void>): Promise<boolean> {
    // A transaction-level lock on a connection of its own, held while `work` runs on others: it
    // goes away with the transaction, so a crashed run never leaves it behind.
    return this.prisma.$transaction(
      async (tx) => {
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtextextended(${CLEANUP_LOCK}, 0)) AS locked`;
        if (!locked) return false;
        await work();
        return true;
      },
      { maxWait: 10_000, timeout: 60 * 60_000 },
    );
  }
}
