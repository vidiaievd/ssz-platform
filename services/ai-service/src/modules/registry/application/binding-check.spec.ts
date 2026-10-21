import type { CapabilityDefinition } from '../../capabilities/domain/capability.js';
import type { ModelFeatures } from '../../providers/domain/model-features.js';
import type { BindingSettings } from '../domain/binding.js';
import { bindingProblems } from './binding-check.js';
import type { ModelForCall } from './ports/registry.reader.js';

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

function found(
  id: string,
  over: { code?: string; credentialRef?: string | null; enabled?: boolean; status?: 'active' | 'disabled'; features?: Partial<ModelFeatures> } = {},
): ModelForCall {
  const code = over.code ?? 'fake';
  return {
    model: { id, providerId: 'p', providerCode: code, providerModelId: id, displayName: id, features: { ...features, ...over.features }, status: over.status ?? 'active' },
    provider: { id: 'p', code, kind: 'fake', displayName: code, baseUrl: null, apiVersion: null, credentialRef: over.credentialRef ?? null, region: 'local', enabled: over.enabled ?? true },
    currentPrice: null,
  };
}

const capability: CapabilityDefinition = { code: 'review_draft', description: '', requiredFeatures: { structuredOutput: 'native', tools: true } };
const settings = (over: Partial<BindingSettings> = {}): BindingSettings => ({
  primaryModelId: 'a',
  fallbackModelId: 'b',
  maxOutputTokens: 2_000,
  temperature: null,
  timeoutMs: 30_000,
  promptVersion: 'v1',
  enabled: true,
  ...over,
});

const check = (s: BindingSettings, primary: ModelForCall | null, fallback: ModelForCall | null, keySet = false) =>
  bindingProblems({ capability, settings: s, primary, fallback, credentials: { isSet: () => keySet } });

describe('bindingProblems', () => {
  it('accepts two capable, configured models — even on a switched-off provider', () => {
    expect(check(settings(), found('a', { enabled: false }), found('b'))).toEqual([]);
  });

  it('accepts a binding without a fallback', () => {
    expect(check(settings({ fallbackModelId: null }), found('a'), null)).toEqual([]);
  });

  it('lists what is wrong with each model', () => {
    const problems = check(
      settings({ maxOutputTokens: 10_000 }),
      found('a', { status: 'disabled', features: { tools: false } }),
      found('b', { code: 'openai', credentialRef: 'OPENAI_API_KEY', features: { structuredOutput: 'json_mode' } }),
    );
    expect(problems).toEqual([
      'primary model "fake/a" is disabled',
      'primary model "fake/a" lacks tools, required by "review_draft"',
      'maxOutputTokens 10000 exceeds primary model "fake/a"\'s maxOutput 8000',
      'fallback model "openai/b": provider not configured — environment variable OPENAI_API_KEY is not set',
      'fallback model "openai/b" lacks structuredOutput native (has json_mode), required by "review_draft"',
      'maxOutputTokens 10000 exceeds fallback model "openai/b"\'s maxOutput 8000',
    ]);
  });

  it('names a model that does not exist', () => {
    expect(check(settings(), null, found('b'))).toEqual(['primary model a does not exist']);
  });

  it('refuses the primary as its own fallback', () => {
    expect(check(settings({ fallbackModelId: 'a' }), found('a'), found('a'))).toEqual(['fallback model must differ from the primary']);
  });
});
