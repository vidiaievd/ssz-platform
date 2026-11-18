import type { AiBinding } from '../../registry/domain/binding.js';
import type { AiModel, AiProvider } from '../../registry/domain/registry.types.js';
import { breakerRows } from './breaker-board.js';
import type { BreakerState } from './ports/breaker-inspector.port.js';

const provider: AiProvider = {
  id: 'p1',
  code: 'anthropic',
  kind: 'anthropic',
  displayName: 'Anthropic',
  baseUrl: null,
  apiVersion: null,
  credentialRef: 'ANTHROPIC_API_KEY',
  region: 'us',
  enabled: true,
};

function model(id: string): AiModel {
  return {
    id,
    providerId: 'p1',
    providerCode: 'anthropic',
    providerModelId: `model-${id}`,
    displayName: `Model ${id}`,
    status: 'active',
    modality: 'llm',
    features: {} as never,
  };
}

function binding(capability: string, primary: string, fallback: string | null, enabled = true): AiBinding {
  return {
    capability,
    primaryModelId: primary,
    fallbackModelId: fallback,
    maxOutputTokens: 1000,
    temperature: null,
    timeoutMs: 30_000,
    promptVersion: 'x@1',
    enabled,
    version: 1,
    updatedBy: 'u',
    updatedAt: new Date(0),
  };
}

const now = new Date('2026-11-14T18:00:00.000Z');

describe('breakerRows', () => {
  it('puts open breakers first, keeps the registry order otherwise, and dates the reopening', () => {
    const states = new Map<string, BreakerState>([
      ['m1', { state: 'closed', reopensInMs: null, recentFailures: 1 }],
      ['m2', { state: 'closed', reopensInMs: null, recentFailures: 0 }],
      ['m3', { state: 'open', reopensInMs: 20_000, recentFailures: 0 }],
    ]);
    const rows = breakerRows([model('m1'), model('m2'), model('m3')], new Map([['p1', provider]]), [], states, now);
    expect(rows.map((r) => r.modelId)).toEqual(['m3', 'm1', 'm2']);
    expect(rows[0]).toMatchObject({
      state: 'open',
      reopensInMs: 20_000,
      reopensAt: new Date('2026-11-14T18:00:20.000Z'),
      provider: { id: 'p1', code: 'anthropic', displayName: 'Anthropic', enabled: true },
      providerModelId: 'model-m3',
    });
    expect(rows[1]).toMatchObject({ state: 'closed', reopensAt: null, recentFailures: 1 });
  });

  it('names the bindings that call each model and in which role', () => {
    const bindings = [binding('review_draft', 'm1', 'm2'), binding('practice', 'm2', null, false), binding('assist', 'm3', 'm1')];
    const rows = breakerRows([model('m1'), model('m2')], new Map([['p1', provider]]), bindings, new Map(), now);
    expect(rows.find((r) => r.modelId === 'm1')!.bindings).toEqual([
      { capability: 'assist', role: 'fallback', enabled: true },
      { capability: 'review_draft', role: 'primary', enabled: true },
    ]);
    expect(rows.find((r) => r.modelId === 'm2')!.bindings).toEqual([
      { capability: 'practice', role: 'primary', enabled: false },
      { capability: 'review_draft', role: 'fallback', enabled: true },
    ]);
  });

  it('shows a model with no state read as unknown', () => {
    const [row] = breakerRows([model('m1')], new Map([['p1', provider]]), [], new Map(), now);
    expect(row).toMatchObject({ state: 'unknown', reopensInMs: null, recentFailures: null, reopensAt: null });
  });
});
