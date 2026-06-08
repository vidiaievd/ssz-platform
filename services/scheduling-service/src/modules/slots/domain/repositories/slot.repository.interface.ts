import type { Slot } from '../entities/slot.entity.js';

export const SLOT_REPOSITORY = Symbol('ISlotRepository');

export interface ISlotRepository {
  findByGroup(groupId: string): Promise<Slot[]>;
  findById(id: string): Promise<Slot | null>;
  create(slot: Omit<Slot, 'id' | 'createdAt'>): Promise<Slot>;
  createMany(slots: Array<Omit<Slot, 'id' | 'createdAt'>>): Promise<Slot[]>;
  deleteByGroup(groupId: string): Promise<void>;
  deleteById(id: string): Promise<void>;
}
