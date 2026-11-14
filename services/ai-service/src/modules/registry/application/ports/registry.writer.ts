import type { AdminAuditEntry } from '../../../../shared/application/admin-audit.js';
import type { AiModel, AiModelStatus, AiProvider } from '../../domain/registry.types.js';

/** What the admin trail records of a provider switch, both sides. */
export interface ProviderSwitchState {
  code: string;
  enabled: boolean;
}

/** What the admin trail records of a model's status, both sides. */
export interface ModelStatusState {
  providerCode: string;
  providerModelId: string;
  status: AiModelStatus;
}

/** Builds the trail entry from what the transaction found before the write. */
export type RegistryAudit<S> = (before: S) => AdminAuditEntry;

export interface RegistryWriteResult<T> {
  value: T;
  /** False when the row already held the asked value: nothing was written, nothing put on the trail. */
  changed: boolean;
}

/**
 * The admin's switches over the registry (plan 90, phase 7, step 7). Each write and its trail
 * (`admin_audit` + outbox event) commit in one transaction; a write that changes nothing is skipped.
 * Null = no such row.
 */
export interface IRegistryWriter {
  setProviderEnabled(
    providerId: string,
    enabled: boolean,
    audit: RegistryAudit<ProviderSwitchState>,
  ): Promise<RegistryWriteResult<AiProvider> | null>;
  setModelStatus(
    modelId: string,
    status: AiModelStatus,
    audit: RegistryAudit<ModelStatusState>,
  ): Promise<RegistryWriteResult<AiModel> | null>;
}

export const REGISTRY_WRITER = Symbol('REGISTRY_WRITER');
