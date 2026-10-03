import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { ProbeTask } from '../../../domain/entities/probe-task.entity.js';
import {
  PROBE_TASK_REPOSITORY,
  type IProbeTaskRepository,
} from '../../../domain/repositories/probe-task.repository.js';
import { ListMyProbesQuery } from './list-my-probes.query.js';

@QueryHandler(ListMyProbesQuery)
export class ListMyProbesHandler implements IQueryHandler<ListMyProbesQuery> {
  constructor(@Inject(PROBE_TASK_REPOSITORY) private readonly probes: IProbeTaskRepository) {}

  /**
   * Live probes only, and the filter is the query's rather than the reader's: a list of
   * tasks that includes ones which will be refused the moment they are opened is a list
   * that lies to whatever renders it.
   */
  async execute(query: ListMyProbesQuery): Promise<ProbeTask[]> {
    return this.probes.findLiveByUser(query.userId, new Date(), query.limit);
  }
}
