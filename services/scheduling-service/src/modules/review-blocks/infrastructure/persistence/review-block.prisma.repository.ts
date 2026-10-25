import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { ReviewBlockMapper } from './review-block.mapper.js';
import { utcDay, type ReviewBlock } from '../../domain/entities/review-block.entity.js';
import type {
  IReviewBlockRepository,
  NewReviewBlock,
  ReviewBlockChanges,
} from '../../domain/repositories/review-block.repository.interface.js';

const WITH_SKIPS = { skips: true } as const;

@Injectable()
export class ReviewBlockPrismaRepository implements IReviewBlockRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ReviewBlock | null> {
    const row = await this.prisma.reviewBlock.findUnique({ where: { id }, include: WITH_SKIPS });
    return row ? ReviewBlockMapper.toDomain(row) : null;
  }

  async findForTeacher(teacherId: string, from: Date, to: Date): Promise<ReviewBlock[]> {
    const rows = await this.prisma.reviewBlock.findMany({
      where: { teacherId, ...this.overlapping(from, to) },
      include: { skips: this.skipsWithin(from, to) },
      orderBy: [{ startsOn: 'asc' }, { startTime: 'asc' }],
    });
    return rows.map(ReviewBlockMapper.toDomain);
  }

  async findForSchool(schoolId: string, from: Date, to: Date): Promise<ReviewBlock[]> {
    const rows = await this.prisma.reviewBlock.findMany({
      where: { schoolId, ...this.overlapping(from, to) },
      include: { skips: this.skipsWithin(from, to) },
      orderBy: [{ teacherId: 'asc' }, { startsOn: 'asc' }, { startTime: 'asc' }],
    });
    return rows.map(ReviewBlockMapper.toDomain);
  }

  async create(block: NewReviewBlock): Promise<ReviewBlock> {
    const row = await this.prisma.reviewBlock.create({
      data: {
        schoolId: block.schoolId,
        teacherId: block.teacherId,
        repeat: block.repeat,
        startsOn: utcDay(block.startsOn),
        endsOn: block.endsOn === null ? null : utcDay(block.endsOn),
        startTime: block.startTime,
        endTime: block.endTime,
        note: block.note,
        createdBy: block.createdBy,
      },
      include: WITH_SKIPS,
    });
    return ReviewBlockMapper.toDomain(row);
  }

  async update(id: string, changes: ReviewBlockChanges): Promise<ReviewBlock> {
    const row = await this.prisma.reviewBlock.update({
      where: { id },
      data: {
        ...changes,
        ...(changes.startsOn !== undefined ? { startsOn: utcDay(changes.startsOn) } : {}),
        ...(changes.endsOn !== undefined
          ? { endsOn: changes.endsOn === null ? null : utcDay(changes.endsOn) }
          : {}),
      },
      include: WITH_SKIPS,
    });
    return ReviewBlockMapper.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.reviewBlock.delete({ where: { id } });
  }

  async addSkip(id: string, date: Date): Promise<void> {
    await this.prisma.reviewBlockSkip.upsert({
      where: { blockId_date: { blockId: id, date: utcDay(date) } },
      create: { blockId: id, date: utcDay(date) },
      update: {},
    });
  }

  /** Started by `to` and not yet over by `from`; a null end never is. */
  private overlapping(from: Date, to: Date) {
    return {
      startsOn: { lte: utcDay(to) },
      OR: [{ endsOn: null }, { endsOn: { gte: utcDay(from) } }],
    };
  }

  /** A skip outside the window cannot remove anything the window shows. */
  private skipsWithin(from: Date, to: Date) {
    return { where: { date: { gte: utcDay(from), lte: utcDay(to) } } };
  }
}
