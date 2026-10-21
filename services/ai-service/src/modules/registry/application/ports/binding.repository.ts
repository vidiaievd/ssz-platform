import type { Result } from '../../../../shared/kernel/result.js';
import type { AiBinding, BindingChange, BindingSettings } from '../../domain/binding.js';

export interface IBindingRepository {
  get(capability: string): Promise<AiBinding | null>;
  list(): Promise<AiBinding[]>;
  /**
   * Writes the settings and appends the history row in one transaction, bumping `version`.
   * `expectedVersion` undefined = write whatever is there; a number = only if the stored
   * version is that (0 = only if there is none yet), else `version_conflict`.
   */
  save(
    capability: string,
    settings: BindingSettings,
    expectedVersion: number | undefined,
    changedBy: string,
  ): Promise<Result<AiBinding, 'version_conflict'>>;
  /** Newest first. */
  history(capability: string): Promise<BindingChange[]>;
}

export const BINDING_REPOSITORY = Symbol('BINDING_REPOSITORY');
