import { Inject, Injectable } from '@nestjs/common';
import type { AiBinding } from '../../registry/domain/binding.js';
import type { AiModel, AiProvider, ModelModality } from '../../registry/domain/registry.types.js';
import { BINDING_REPOSITORY, type IBindingRepository } from '../../registry/application/ports/binding.repository.js';
import { REGISTRY_READER, type IRegistryReader } from '../../registry/application/ports/registry.reader.js';
import { BREAKER_INSPECTOR, type BreakerState, type IBreakerInspector } from './ports/breaker-inspector.port.js';

/** A binding that would call the model: as its main model or as the fallback. */
export interface BreakerBindingRef {
  capability: string;
  role: 'primary' | 'fallback';
  enabled: boolean;
}

/** One registry model with its breaker, as the admin's board shows it. */
export type BreakerRow = BreakerState & {
  modelId: string;
  providerModelId: string;
  displayName: string;
  modality: ModelModality;
  status: AiModel['status'];
  provider: { id: string; code: string; displayName: string; enabled: boolean };
  /** When the router calls the model again; null unless open. */
  reopensAt: Date | null;
  bindings: BreakerBindingRef[];
};

/**
 * Pure: joins models, their providers, the bindings that use them and the breaker states.
 * Open breakers first (they are what the admin came for), the registry's order otherwise.
 */
export function breakerRows(
  models: AiModel[],
  providers: ReadonlyMap<string, AiProvider>,
  bindings: AiBinding[],
  states: ReadonlyMap<string, BreakerState>,
  now: Date,
): BreakerRow[] {
  const rows = models.map((model): BreakerRow => {
    const state: BreakerState = states.get(model.id) ?? { state: 'unknown', reopensInMs: null, recentFailures: null };
    const provider = providers.get(model.providerId);
    return {
      ...state,
      modelId: model.id,
      providerModelId: model.providerModelId,
      displayName: model.displayName,
      modality: model.modality,
      status: model.status,
      provider: {
        id: model.providerId,
        code: provider?.code ?? model.providerCode,
        displayName: provider?.displayName ?? model.providerCode,
        enabled: provider?.enabled ?? false,
      },
      reopensAt: state.state === 'open' ? new Date(now.getTime() + state.reopensInMs) : null,
      bindings: bindingsOf(model.id, bindings),
    };
  });
  const rank = (r: BreakerRow) => (r.state === 'open' ? 0 : 1);
  return rows.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map(({ r }) => r);
}

function bindingsOf(modelId: string, bindings: AiBinding[]): BreakerBindingRef[] {
  const refs: BreakerBindingRef[] = [];
  for (const b of bindings) {
    if (b.primaryModelId === modelId) refs.push({ capability: b.capability, role: 'primary', enabled: b.enabled });
    else if (b.fallbackModelId === modelId) refs.push({ capability: b.capability, role: 'fallback', enabled: b.enabled });
  }
  return refs.sort((a, b) => a.capability.localeCompare(b.capability));
}

/** Reads what `breakerRows` needs: every registry model, or one. */
@Injectable()
export class BreakerBoard {
  constructor(
    @Inject(REGISTRY_READER) private readonly registry: IRegistryReader,
    @Inject(BINDING_REPOSITORY) private readonly bindings: IBindingRepository,
    @Inject(BREAKER_INSPECTOR) private readonly breakers: IBreakerInspector,
  ) {}

  /** `onlyModelId` — just that model's row (empty when there is no such model). */
  async rows(onlyModelId?: string): Promise<BreakerRow[]> {
    const now = new Date();
    const [models, providers, bindings] = await Promise.all([
      this.registry.listModels({}, now),
      this.registry.listProviders(),
      this.bindings.list(),
    ]);
    const picked = onlyModelId ? models.filter((m) => m.id === onlyModelId) : models;
    const states = await this.breakers.inspect(picked.map((m) => m.id));
    return breakerRows(picked, new Map(providers.map((p) => [p.id, p])), bindings, states, now);
  }
}
