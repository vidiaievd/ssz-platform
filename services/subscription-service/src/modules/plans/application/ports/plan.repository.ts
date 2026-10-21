import type { Result } from '../../../../shared/kernel/result.js';
import type { Plan, PlanVersion } from '../../domain/plan.js';

export interface IPlanRepository {
  /** The plan with its current (= latest) version. */
  findByCode(code: string): Promise<Plan | null>;
  list(): Promise<Plan[]>;
  /** Every version of the plan, newest first; empty for an unknown code. */
  versions(code: string): Promise<PlanVersion[]>;
  create(plan: Plan): Promise<Result<void, 'code_taken'>>;
  /**
   * Writes name and status, plus the current version when it is newer than `baseVersion` —
   * only if the stored current version is still `baseVersion`, else `version_conflict`.
   */
  save(plan: Plan, baseVersion: number): Promise<Result<void, 'version_conflict'>>;
}

export const PLAN_REPOSITORY = Symbol('PLAN_REPOSITORY');
