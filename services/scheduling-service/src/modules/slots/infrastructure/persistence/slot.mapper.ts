import type { Slot as PrismaSlot } from '@prisma/client';
import { Slot, type WeekDay } from '../../domain/entities/slot.entity.js';

export class SlotMapper {
  static toDomain(row: PrismaSlot): Slot {
    return new Slot(
      row.id,
      row.groupId,
      row.schoolId,
      row.weekday as WeekDay,
      row.startTime,
      row.endTime,
      row.room,
      row.createdAt,
    );
  }
}
