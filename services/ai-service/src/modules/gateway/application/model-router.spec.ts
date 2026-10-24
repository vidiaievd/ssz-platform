import { SchemaGuard } from '../../providers/application/schema-guard.js';
import { LlmError } from '../../providers/domain/llm-error.js';
import type { LlmProvider } from '../../providers/domain/llm-provider.port.js';
import type { ModelFeatures, ProviderKind } from '../../providers/domain/model-features.js';
import { FakeLlmProvider } from '../../providers/infrastructure/fake/fake-llm.provider.js';
import type { ModelForCall } from '../../registry/application/ports/registry.reader.js';
import type { AiBinding } from '../../registry/domain/binding.js';
import type { AiRegion } from '../../registry/domain/registry.types.js';
import { ModelRouter, type GatewayRequest } from './model-router.js';
import type { ICircuitBreaker } from './ports/circuit-breaker.port.js';

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

function model(
  id: string,
  over: {
    providerModelId?: string;
    enabled?: boolean;
    status?: 'active' | 'disabled';
    kind?: ProviderKind;
    credentialRef?: string;
    region?: AiRegion;
  } = {},
): ModelForCall {
  return {
    model: {
      id,
      providerId: `p-${id}`,
      providerCode: 'fake',
      providerModelId: over.providerModelId ?? 'fake',
      displayName: id,
      features,
      status: over.status ?? 'active',
    },
    provider: {
      id: `p-${id}`,
      code: `prov-${id}`,
      kind: over.kind ?? 'fake',
      displayName: id,
      baseUrl: null,
      apiVersion: null,
      credentialRef: over.credentialRef ?? null,
      region: over.region ?? 'local',
      enabled: over.enabled ?? true,
    },
    currentPrice: null,
  };
}

const binding = (over: Partial<AiBinding> = {}): AiBinding => ({
  capability: 'diagnostic',
  primaryModelId: 'primary',
  fallbackModelId: 'fallback',
  maxOutputTokens: 512,
  temperature: null,
  timeoutMs: 5_000,
  promptVersion: 'diagnostic@1',
  enabled: true,
  version: 1,
  updatedBy: 'admin',
  updatedAt: new Date(),
  ...over,
});

class MemoryBreaker implements ICircuitBreaker {
  readonly open = new Set<string>();
  readonly failures: Array<{ key: string; retryAfterMs?: number }> = [];
  readonly successes: string[] = [];
  async isOpen(key: string) {
    return this.open.has(key);
  }
  async recordFailure(key: string, retryAfterMs?: number) {
    this.failures.push({ key, retryAfterMs });
  }
  async recordSuccess(key: string) {
    this.successes.push(key);
  }
}

const CALL: GatewayRequest = {
  system: 'echo',
  messages: [{ role: 'user', parts: [{ type: 'text', text: 'ping' }] }],
  responseSchema: { name: 'echo', schema: { type: 'object', required: ['echo'], properties: { echo: { type: 'string' } } } },
};

function setup(opts: { binding: AiBinding | null; models: ModelForCall[]; providers?: LlmProvider[]; keySet?: boolean }) {
  const breaker = new MemoryBreaker();
  const byId = new Map(opts.models.map((m) => [m.model.id, m]));
  const router = new ModelRouter(
    { get: async () => opts.binding },
    { getModelForCall: async (id: string) => byId.get(id) ?? null } as never,
    { isSet: () => opts.keySet ?? false },
    opts.providers ?? [new FakeLlmProvider()],
    breaker,
    new SchemaGuard(),
  );
  return { router, breaker };
}

describe('ModelRouter', () => {
  it('answers from the primary when it works, without touching the fallback', async () => {
    const { router, breaker } = setup({ binding: binding(), models: [model('primary'), model('fallback')] });
    const routed = await router.call('diagnostic', CALL);
    expect(routed.isOk).toBe(true);
    expect(routed.value.role).toBe('primary');
    expect(routed.value.result.output.kind).toBe('structured');
    expect(routed.value.attempts).toEqual([{ role: 'primary', modelId: 'primary', outcome: 'ok', reason: null }]);
    expect(breaker.successes).toEqual(['primary']);
  });

  it('switches to the fallback on a retryable error and counts it against the primary', async () => {
    const { router, breaker } = setup({
      binding: binding(),
      models: [model('primary', { providerModelId: 'fake-rate-limited' }), model('fallback')],
    });
    const routed = await router.call('diagnostic', CALL);
    expect(routed.isOk).toBe(true);
    expect(routed.value.role).toBe('fallback');
    expect(routed.value.attempts.map((a) => [a.role, a.outcome, a.reason])).toEqual([
      ['primary', 'error', 'rate_limited'],
      ['fallback', 'ok', null],
    ]);
    expect(breaker.failures.map((f) => f.key)).toEqual(['primary']);
  });

  it('does not switch on a non-retryable error', async () => {
    const { router, breaker } = setup({
      binding: binding(),
      models: [model('primary', { providerModelId: 'fake-auth' }), model('fallback')],
    });
    const routed = await router.call('diagnostic', CALL);
    expect(routed.isFail).toBe(true);
    const failure = routed.error;
    expect(failure.kind).toBe('error');
    if (failure.kind !== 'error') return;
    expect(failure.error.code).toBe('auth');
    expect(failure.role).toBe('primary');
    expect(failure.attempts).toHaveLength(1);
    expect(breaker.failures).toEqual([]);
  });

  it('does not switch on an answer that fails the schema, and keeps it for the ledger', async () => {
    const { router } = setup({
      binding: binding(),
      models: [model('primary', { providerModelId: 'fake-invalid-schema' }), model('fallback')],
    });
    const failure = (await router.call('diagnostic', CALL)).error;
    expect(failure.kind).toBe('error');
    if (failure.kind !== 'error') return;
    expect(failure.error.code).toBe('invalid_response');
    expect(failure.raw?.usage.input).toBeGreaterThan(0);
  });

  it.each([
    ['provider_disabled', model('primary', { enabled: false })],
    ['model_disabled', model('primary', { status: 'disabled' })],
    ['provider_not_configured', model('primary', { credentialRef: 'SOME_KEY' })],
    ['no_adapter', model('primary', { kind: 'anthropic' })],
  ])('steps over a primary that is %s', async (reason, primary) => {
    const { router } = setup({ binding: binding(), models: [primary, model('fallback')] });
    const routed = await router.call('diagnostic', CALL);
    expect(routed.isOk).toBe(true);
    expect(routed.value.role).toBe('fallback');
    expect(routed.value.attempts[0]).toEqual({ role: 'primary', modelId: 'primary', outcome: 'skipped', reason });
  });

  it('goes straight to the fallback while the primary breaker is open', async () => {
    const { router, breaker } = setup({ binding: binding(), models: [model('primary'), model('fallback')] });
    breaker.open.add('primary');
    const routed = await router.call('diagnostic', CALL);
    expect(routed.value.role).toBe('fallback');
    expect(routed.value.attempts[0]!.reason).toBe('breaker_open');
  });

  it('passes the provider retry-after to the breaker', async () => {
    const limited: LlmProvider = {
      kind: 'anthropic',
      complete: async () => {
        throw new LlmError('rate_limited', 'slow down', { retryAfterMs: 20_000 });
      },
      stream: () => {
        throw new Error('unused');
      },
    };
    const { router, breaker } = setup({
      binding: binding(),
      models: [model('primary', { kind: 'anthropic' }), model('fallback')],
      providers: [limited, new FakeLlmProvider()],
    });
    expect((await router.call('diagnostic', CALL)).value.role).toBe('fallback');
    expect(breaker.failures).toEqual([{ key: 'primary', retryAfterMs: 20_000 }]);
  });

  it('reports the fallback error when both fail retryably', async () => {
    const { router } = setup({
      binding: binding(),
      models: [model('primary', { providerModelId: 'fake-rate-limited' }), model('fallback', { providerModelId: 'fake-overloaded' })],
    });
    const failure = (await router.call('diagnostic', CALL)).error;
    expect(failure.kind).toBe('error');
    if (failure.kind !== 'error') return;
    expect(failure.role).toBe('fallback');
    expect(failure.error.code).toBe('overloaded');
    expect(failure.attempts).toHaveLength(2);
  });

  it('is unavailable when no model could be called', async () => {
    const { router } = setup({
      binding: binding({ fallbackModelId: null }),
      models: [model('primary', { enabled: false })],
    });
    const failure = (await router.call('diagnostic', CALL)).error;
    expect(failure.kind).toBe('unavailable');
    expect(failure.attempts).toEqual([{ role: 'primary', modelId: 'primary', outcome: 'skipped', reason: 'provider_disabled' }]);
  });

  it('refuses an unbound or switched-off capability without calling anything', async () => {
    for (const b of [null, binding({ enabled: false })]) {
      const { router, breaker } = setup({ binding: b, models: [model('primary')] });
      const failure = (await router.call('diagnostic', CALL)).error;
      expect(failure.kind).toBe('disabled');
      expect(breaker.successes).toEqual([]);
    }
  });

  it('applies the binding parameters to the request', async () => {
    const seen: unknown[] = [];
    const spy: LlmProvider = {
      kind: 'fake',
      complete: async (request, ref) => {
        seen.push(request);
        return new FakeLlmProvider().complete(request, ref);
      },
      stream: () => {
        throw new Error('unused');
      },
    };
    const { router } = setup({ binding: binding({ temperature: 0.3 }), models: [model('primary')], providers: [spy] });
    await router.call('diagnostic', CALL);
    expect(seen[0]).toMatchObject({ maxOutputTokens: 512, timeoutMs: 5_000, temperature: 0.3 });
  });

  it("builds the request from the binding's prompt version when given a builder", async () => {
    const versions: string[] = [];
    const { router } = setup({ binding: binding({ promptVersion: 'diagnostic@7' }), models: [model('primary')] });
    const routed = await router.call('diagnostic', (promptVersion) => {
      versions.push(promptVersion);
      return CALL;
    });
    expect(routed.isOk).toBe(true);
    expect(versions).toEqual(['diagnostic@7']);
  });

  it('does not build the request for a switched-off capability', async () => {
    const build = jest.fn(() => CALL);
    const { router } = setup({ binding: binding({ enabled: false }), models: [model('primary')] });
    await router.call('diagnostic', build);
    expect(build).not.toHaveBeenCalled();
  });

  describe('payer regions', () => {
    const EU_ONLY = { allowedRegions: ['eu' as const] };

    it('steps over a primary outside the payer’s regions to a fallback inside them', async () => {
      const { router } = setup({
        binding: binding(),
        models: [model('primary', { region: 'us' }), model('fallback', { region: 'eu' })],
      });
      const routed = await router.call('diagnostic', CALL, EU_ONLY);
      expect(routed.value.role).toBe('fallback');
      expect(routed.value.attempts.map((a) => [a.role, a.outcome, a.reason])).toEqual([
        ['primary', 'skipped', 'region_not_allowed'],
        ['fallback', 'ok', null],
      ]);
    });

    it('refuses by policy when every model is outside the payer’s regions', async () => {
      const { router } = setup({
        binding: binding(),
        models: [model('primary', { region: 'us' }), model('fallback', { region: 'global' })],
      });
      const routed = await router.call('diagnostic', CALL, EU_ONLY);
      expect(routed.error).toMatchObject({ kind: 'refused', code: 'region_not_allowed' });
    });

    it('reports an outage, not a refusal, when the allowed model is down for another reason', async () => {
      const { router } = setup({
        binding: binding(),
        models: [model('primary', { region: 'us' }), model('fallback', { region: 'eu', enabled: false })],
      });
      expect((await router.call('diagnostic', CALL, EU_ONLY)).error.kind).toBe('unavailable');
    });

    it('matches regions literally: a local model is not allowed by an EU-only list', async () => {
      const { router } = setup({ binding: binding({ fallbackModelId: null }), models: [model('primary', { region: 'local' })] });
      expect((await router.call('diagnostic', CALL, EU_ONLY)).error.kind).toBe('refused');
      expect((await router.call('diagnostic', CALL, { allowedRegions: ['eu', 'local'] })).isOk).toBe(true);
    });
  });
});
