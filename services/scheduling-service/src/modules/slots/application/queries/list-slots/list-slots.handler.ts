import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { ListSlotsQuery } from './list-slots.query.js';
import { SLOT_REPOSITORY, type ISlotRepository } from '../../../domain/repositories/slot.repository.interface.js';
import type { Slot } from '../../../domain/entities/slot.entity.js';
import { OrgServiceHttpClient } from '../../../../../infrastructure/org/org-service.http-client.js';

@QueryHandler(ListSlotsQuery)
export class ListSlotsHandler implements IQueryHandler<ListSlotsQuery, Slot[]> {
  constructor(
    @Inject(SLOT_REPOSITORY) private readonly slots: ISlotRepository,
    private readonly orgClient: OrgServiceHttpClient,
  ) {}

  async execute(query: ListSlotsQuery): Promise<Slot[]> {
    const group = await this.orgClient.getGroup(query.schoolId, query.groupId);
    if (!group) throw new NotFoundException(`Group ${query.groupId} not found in school ${query.schoolId}`);
    return this.slots.findByGroup(query.groupId);
  }
}
