import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { SlotMapper } from './slot.mapper.js';
import type { ISlotRepository } from '../../domain/repositories/slot.repository.interface.js';
import type { Slot } from '../../domain/entities/slot.entity.js';

@Injectable()
export class SlotPrismaRepository implements ISlotRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByGroup(groupId: string): Promise<Slot[]> {
    const rows = await this.prisma.slot.findMany({ where: { groupId }, orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] });
    return rows.map(SlotMapper.toDomain);
  }

  async findById(id: string): Promise<Slot | null> {
    const row = await this.prisma.slot.findUnique({ where: { id } });
    return row ? SlotMapper.toDomain(row) : null;
  }

  async create(slot: Omit<Slot, 'id' | 'createdAt'>): Promise<Slot> {
    const row = await this.prisma.slot.create({
      data: {
        groupId: slot.groupId,
        schoolId: slot.schoolId,
        weekday: slot.weekday,
        startTime: slot.startTime,
        endTime: slot.endTime,
        room: slot.room,
      },
    });
    return SlotMapper.toDomain(row);
  }

  async createMany(slots: Array<Omit<Slot, 'id' | 'createdAt'>>): Promise<Slot[]> {
    if (!slots.length) return [];
    const rows = await this.prisma.$transaction(
      slots.map((s) =>
        this.prisma.slot.create({
          data: {
            groupId: s.groupId,
            schoolId: s.schoolId,
            weekday: s.weekday,
            startTime: s.startTime,
            endTime: s.endTime,
            room: s.room,
          },
        }),
      ),
    );
    return rows.map(SlotMapper.toDomain);
  }

  async deleteByGroup(groupId: string): Promise<void> {
    await this.prisma.slot.deleteMany({ where: { groupId } });
  }

  async deleteById(id: string): Promise<void> {
    await this.prisma.slot.delete({ where: { id } });
  }
}
