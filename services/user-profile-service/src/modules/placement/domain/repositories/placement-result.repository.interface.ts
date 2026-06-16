import type { PlacementResult } from '../entities/placement-result.entity.js';

export const PLACEMENT_RESULT_REPOSITORY = Symbol('PLACEMENT_RESULT_REPOSITORY');

export interface IPlacementResultRepository {
  save(result: PlacementResult): Promise<void>;
  findAllByUserId(userId: string): Promise<PlacementResult[]>;
  findLatestPlatformByUserAndLang(userId: string, language: string): Promise<PlacementResult | null>;
}
