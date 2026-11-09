import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { AtomFlagDay, AtomFlagEntry, AtomFlagSource, IAtomFlagLog } from '../../domain/repositories/atom-flag-log.interface.js';

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

  async recentFlags(userId: string, atomType: string, atomIdPrefix: string, from: Date): Promise<AtomFlagDay[]> {
    const rows = await this.prisma.atomFlag.findMany({
      where: { userId, atomType, atomId: { startsWith: atomIdPrefix }, flaggedOn: { gte: from } },
      select: { atomId: true, source: true, flaggedOn: true },
      orderBy: { flaggedOn: 'asc' },
    });
    return rows.map((r) => ({ atomId: r.atomId, source: r.source as AtomFlagSource, flaggedOn: r.flaggedOn }));
  }
}
