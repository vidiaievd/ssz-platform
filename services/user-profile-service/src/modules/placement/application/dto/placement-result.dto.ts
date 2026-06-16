import type { PlacementScope } from '../../domain/entities/placement-result.entity.js';

export class PlacementResultDto {
  id: string;
  userId: string;
  language: string;
  cefrLevel: string;
  score: number;
  scope: PlacementScope;
  membershipId?: string;
  sourceLabel: string;
  takenAt: Date;
  createdAt: Date;
}
