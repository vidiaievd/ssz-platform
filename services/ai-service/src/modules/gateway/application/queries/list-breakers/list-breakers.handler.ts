import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { BreakerBoard, type BreakerRow } from '../../breaker-board.js';
import { BREAKER_INSPECTOR, type BreakerSettings, type IBreakerInspector } from '../../ports/breaker-inspector.port.js';
import { ListBreakersQuery } from './list-breakers.query.js';

export interface BreakerBoardView {
  settings: BreakerSettings;
  /** False when at least one breaker could not be read (its state is `unknown`). */
  storeAvailable: boolean;
  items: BreakerRow[];
}

/** Every registry model with its breaker (plan 90, phase 7, step 8). */
@QueryHandler(ListBreakersQuery)
export class ListBreakersHandler implements IQueryHandler<ListBreakersQuery, BreakerBoardView> {
  constructor(
    private readonly board: BreakerBoard,
    @Inject(BREAKER_INSPECTOR) private readonly breakers: IBreakerInspector,
  ) {}

  async execute(): Promise<BreakerBoardView> {
    const items = await this.board.rows();
    return {
      settings: this.breakers.settings(),
      storeAvailable: items.every((i) => i.state !== 'unknown'),
      items,
    };
  }
}
