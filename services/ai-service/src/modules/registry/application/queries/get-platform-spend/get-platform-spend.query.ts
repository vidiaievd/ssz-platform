import type { SpendPeriod } from '../../../domain/platform-spend.js';

export class GetPlatformSpendQuery {
  constructor(readonly period: SpendPeriod) {}
}
