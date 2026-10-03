import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { ProbeTask } from '../../domain/entities/probe-task.entity.js';
import type { IProbeTaskRepository } from '../../domain/repositories/probe-task.repository.js';
import { ProbeTaskMapper } from './probe-task.mapper.js';

@Injectable()
export class PrismaProbeTaskRepository implements IProbeTaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(probe: ProbeTask): Promise<void> {
    // `as any` for the same reason the attempt repository does it: the mapper answers in
    // the model's shape, whose Json columns read as `JsonValue`, and Prisma's write input
    // wants `InputJsonValue` — the same values, typed for the opposite direction.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = ProbeTaskMapper.toPersistence(probe) as any;
    await this.prisma.probeTask.upsert({
      where: { id: probe.id },
      create: data,
      update: data,
    });
  }

  async findById(id: string): Promise<ProbeTask | null> {
    const row = await this.prisma.probeTask.findUnique({ where: { id } });
    return row ? ProbeTaskMapper.toDomain(row) : null;
  }

  async findLiveByUser(userId: string, now: Date, limit: number): Promise<ProbeTask[]> {
    const rows = await this.prisma.probeTask.findMany({
      where: { userId, expiresAt: { gt: now } },
      orderBy: { expiresAt: 'asc' },
      take: limit,
    });
    return rows.map(ProbeTaskMapper.toDomain);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.probeTask.deleteMany({ where: { id } });
  }

  /**
   * Raw SQL, and the one place in this module that needs it.
   *
   * The condition it has to express is "no attempt is open on this probe", and the two
   * tables have no relation to join on: an attempt names its exercise by id, and that id
   * points at the catalogue or at this table depending on where the definition turned up
   * (see the migration). Prisma cannot write a `NOT EXISTS` across models it does not
   * know are related, and the alternative — read the candidate ids, ask the attempts
   * table about them, delete the survivors — is the same query in three round trips with
   * a race in the middle, where the race loses a learner their open task.
   *
   * `LIMIT` keeps one sweep bounded; the next one takes the rest.
   */
  async deleteExpired(now: Date, limit: number): Promise<number> {
    const deleted = await this.prisma.$executeRaw`
      DELETE FROM "probe_tasks"
      WHERE "id" IN (
        SELECT p."id"
        FROM "probe_tasks" p
        WHERE p."expires_at" <= ${now}
          AND NOT EXISTS (
            SELECT 1 FROM "attempts" a
            WHERE a."exercise_id" = p."id" AND a."status" = 'in_progress'
          )
        ORDER BY p."expires_at" ASC
        LIMIT ${limit}
      )
    `;
    return deleted;
  }
}
