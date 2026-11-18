import type { AdminAuditEntry } from '../../../../shared/application/admin-audit.js';
import type { Result } from '../../../../shared/kernel/result.js';
import type { AiBinding, BindingChange, BindingSettings } from '../../domain/binding.js';

/**
 * The admin trail of one write, built from what the transaction found: the settings before (null =
 * the write creates the binding) and the version the write makes. Its actor is the binding's `updatedBy`.
 */
export type BindingAudit = (before: (BindingSettings & { version: number }) | null, version: number) => AdminAuditEntry;

export interface IBindingRepository {
  get(capability: string): Promise<AiBinding | null>;
  list(): Promise<AiBinding[]>;
  /**
   * Writes the settings, appends the history row and puts the change on the admin trail (row +
   * outbox event) in one transaction, bumping `version`. `expectedVersion` undefined = write whatever is there; a number = only if the stored
   * version is that (0 = only if there is none yet), else `version_conflict`.
   */
  save(
    capability: string,
    settings: BindingSettings,
    expectedVersion: number | undefined,
    audit: BindingAudit,
  ): Promise<Result<AiBinding, 'version_conflict'>>;
  /** Newest first. */
  history(capability: string): Promise<BindingChange[]>;
}

export const BINDING_REPOSITORY = Symbol('BINDING_REPOSITORY');
