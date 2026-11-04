import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { AtomFlagEntry, IAtomFlagLog } from '../../domain/repositories/atom-flag-log.interface.js';

@Injectable()
export class PrismaAtomFlagLog implements IAtomFlagLog {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AtomFlagEntry): Promise<'recorded' | 'duplicate'> {
    // ON CONFLICT DO NOTHING on the day's key: two deliveries racing each other both ask, and
    // exactly one of them is told it recorded the flag.
    const { count } = await this.prisma.atomFlag.createMany({ data: [entry], skipDuplicates: true });
    return count === 1 ? 'recorded' : 'duplicate';
  }

  async flaggedDays(userId: string, atomType: string, atomId: string, from: Date, before: Date): Promise<number> {
    // `(user_id, atom_id)` is indexed; a learner's flags of one atom over a fortnight are a handful.
    const days = await this.prisma.atomFlag.findMany({
      where: { userId, atomType, atomId, flaggedOn: { gte: from, lt: before } },
      distinct: ['flaggedOn'],
      select: { flaggedOn: true },
    });
    return days.length;
  }
}
