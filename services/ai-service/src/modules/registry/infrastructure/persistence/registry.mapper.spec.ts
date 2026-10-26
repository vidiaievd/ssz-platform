// The Decimal class Prisma's runtime hands out, imported from the runtime package: pulling
// the generated client in by value breaks jest's CommonJS transform.
import { Decimal } from '@prisma/client-runtime-utils';
import { toModel, toPrice, toProvider } from './registry.mapper.js';

// Guards the Prisma boundary that repository mocks cannot see: enum values must arrive
// as the lowercase wire strings the domain uses, and money must stay exact.
describe('registry mapper', () => {
  const now = new Date('2026-10-20T00:00:00.000Z');

  it('passes provider enums through as wire strings', () => {
    const p = toProvider({
      id: 'p1',
      code: 'azure-openai',
      kind: 'azure_openai',
      displayName: 'Azure OpenAI',
      baseUrl: null,
      apiVersion: null,
      credentialRef: 'AZURE_OPENAI_API_KEY',
      region: 'eu',
      enabled: false,
      createdAt: now,
      updatedAt: now,
    });
    expect(p.kind).toBe('azure_openai');
    expect(p.region).toBe('eu');
  });

  it('maps a model with its provider code', () => {
    const m = toModel({
      id: 'm1',
      providerId: 'p1',
      providerModelId: 'claude-sonnet-5-5',
      displayName: 'Claude Sonnet 5.5',
      modality: 'llm',
      features: { structuredOutput: 'native' },
      status: 'deprecated',
      createdAt: now,
      updatedAt: now,
      provider: { code: 'anthropic' },
    });
    expect(m).toMatchObject({
      providerCode: 'anthropic',
      status: 'deprecated',
      modality: 'llm',
      features: { structuredOutput: 'native' },
    });
  });

  it('maps a speech model with its speech features', () => {
    const m = toModel({
      id: 'm2',
      providerId: 'p1',
      providerModelId: 'fake-speech',
      displayName: 'Fake speech',
      modality: 'speech',
      features: { languages: ['nb'], wordTimings: true, pronunciation: false, maxAudioSeconds: 120 },
      status: 'active',
      createdAt: now,
      updatedAt: now,
      provider: { code: 'fake' },
    });
    expect(m).toMatchObject({ modality: 'speech', features: { languages: ['nb'], maxAudioSeconds: 120 } });
  });

  it('keeps prices as exact decimal strings', () => {
    const price = toPrice({
      id: 'x',
      modelId: 'm1',
      effectiveFrom: now,
      inputPerMtok: new Decimal('0.000001'),
      outputPerMtok: new Decimal('10.123456'),
      cacheReadPerMtok: new Decimal('0.2'),
      cacheWritePerMtok: new Decimal('2.5'),
      audioPerHour: new Decimal('0.36'),
      currency: 'USD',
      createdAt: now,
    });
    expect(price).toMatchObject({
      inputPerMtok: '0.000001',
      outputPerMtok: '10.123456',
      cacheReadPerMtok: '0.2',
      cacheWritePerMtok: '2.5',
      audioPerHour: '0.36',
    });
  });
});
