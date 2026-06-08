import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListSlotsQuery } from './list-slots.query.js';
import { SLOT_REPOSITORY, type ISlotRepository } from '../../../domain/repositories/slot.repository.interface.js';
import type { Slot } from '../../../domain/entities/slot.entity.js';

@QueryHandler(ListSlotsQuery)
export class ListSlotsHandler implements IQueryHandler<ListSlotsQuery, Slot[]> {
  constructor(
    @Inject(SLOT_REPOSITORY) private readonly slots: ISlotRepository,
  ) {}

  execute(query: ListSlotsQuery): Promise<Slot[]> {
    return this.slots.findByGroup(query.groupId);
  }
}
