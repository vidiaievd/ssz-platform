import type { StatsPeriod } from '../../domain/admin-stats.js';

export class GetAdminStatsQuery {
  constructor(public readonly period: StatsPeriod) {}
}
