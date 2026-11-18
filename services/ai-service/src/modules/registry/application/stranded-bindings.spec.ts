import type { ModelFeatures } from '../../providers/domain/model-features.js';
import type { AiBinding } from '../domain/binding.js';
import type { ModelForCall } from './ports/registry.reader.js';
import { modelServes, strandedCapabilities } from './stranded-bindings.js';

const features: ModelFeatures = {
  structuredOutput: 'native',
  tools: true,
  streaming: true,
  vision: false,
  audioIn: false,
  batch: false,
  promptCache: false,
  contextWindow: 100_000,
  maxOutput: 8_000,
};

function model(id: string, over: { status?: 'active' | 'deprecated' | 'disabled'; enabled?: boolean; credentialRef?: string | null } = {}): ModelForCall {
  return {
    model: { id, providerId: 'p', providerCode: 'x', providerModelId: id, displayName: id, modality: 'llm', features, status: over.status ?? 'active' },
    provider: {
      id: 'p',
      code: 'x',
      kind: 'anthropic',
      displayName: 'X',
      baseUrl: null,
      apiVersion: null,
      credentialRef: over.credentialRef === undefined ? null : over.credentialRef,
      region: 'eu',
      enabled: over.enabled ?? true,
    },
    currentPrice: null,
  };
}

function binding(capability: string, primary: string, fallback: string | null, enabled = true): AiBinding {
  return {
    capability,
    primaryModelId: primary,
    fallbackModelId: fallback,
    maxOutputTokens: 512,
    temperature: null,
    timeoutMs: 30_000,
    promptVersion: `${capability}@1`,
    enabled,
    version: 1,
    updatedBy: 'u',
    updatedAt: new Date(),
  };
}

const keySet = { isSet: (name: string) => name === 'SET_KEY' };

describe('modelServes', () => {
  it('needs the model, an active or deprecated status, a provider on and configured', () => {
    expect(modelServes(model('a'), keySet)).toBe(true);
    expect(modelServes(model('a', { status: 'deprecated' }), keySet)).toBe(true);
    expect(modelServes(null, keySet)).toBe(false);
    expect(modelServes(model('a', { status: 'disabled' }), keySet)).toBe(false);
    expect(modelServes(model('a', { enabled: false }), keySet)).toBe(false);
    expect(modelServes(model('a', { credentialRef: 'MISSING_KEY' }), keySet)).toBe(false);
    expect(modelServes(model('a', { credentialRef: 'SET_KEY' }), keySet)).toBe(true);
  });
});

describe('strandedCapabilities', () => {
  it('names bindings on the touched models with nothing left that serves, sorted', () => {
    const models = new Map([
      ['a', model('a', { enabled: false })],
      ['b', model('b', { status: 'disabled' })],
      ['c', model('c')],
    ]);
    const bindings = [
      binding('z_both_gone', 'a', 'b'),
      binding('fallback_holds', 'a', 'c'),
      binding('alone', 'a', null),
      binding('switched_off', 'a', null, false),
      binding('untouched', 'b', null),
    ];
    expect(strandedCapabilities(bindings, new Set(['a']), models, keySet)).toEqual(['alone', 'z_both_gone']);
  });

  it('counts a binding touched through its fallback', () => {
    const models = new Map([
      ['a', model('a', { status: 'disabled' })],
      ['b', model('b', { status: 'disabled' })],
    ]);
    expect(strandedCapabilities([binding('cap', 'a', 'b')], new Set(['b']), models, keySet)).toEqual(['cap']);
  });

  it('treats a model missing from the registry as one that does not serve', () => {
    expect(strandedCapabilities([binding('cap', 'gone', null)], new Set(['gone']), new Map(), keySet)).toEqual(['cap']);
  });
});
