import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { ISeatLimitProjection, SeatLimitSnapshot } from '../../shared/application/ports/seat-limit.interface.js';

interface Row {
  maxSeats: number | null;
  version: number;
  validUntil: Date;
}

/** `school_seat_limits` (plan 90, phase 4) — same supersede rule as ai-service's entitlement projection. */
@Injectable()
export class SeatLimitPrismaProjection implements ISeatLimitProjection {
  constructor(private readonly prisma: PrismaService) {}

  async get(schoolId: string): Promise<SeatLimitSnapshot | null> {
    const row = (await (this.prisma as any).schoolSeatLimit.findUnique({ where: { schoolId } })) as Row | null;
    return row ? { max: row.maxSeats, version: row.version, validUntil: row.validUntil } : null;
  }

  async save(schoolId: string, s: SeatLimitSnapshot): Promise<boolean> {
    const data = { maxSeats: s.max, version: s.version, validUntil: s.validUntil, receivedAt: new Date() };
    const update = () =>
      (this.prisma as any).schoolSeatLimit.updateMany({
        where: {
          schoolId,
          OR: [{ version: { lt: s.version } }, { version: s.version, validUntil: { lte: s.validUntil } }],
        },
        data,
      }) as Promise<{ count: number }>;

    if ((await update()).count > 0) return true;
    const created = (await (this.prisma as any).schoolSeatLimit.createMany({
      data: [{ schoolId, ...data }],
      skipDuplicates: true,
    })) as { count: number };
    if (created.count > 0) return true;
    // Either the row held supersedes this one, or it was inserted between the two writes.
    return (await update()).count > 0;
  }
}
