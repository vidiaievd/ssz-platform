import type { AiProvider } from '../domain/registry.types.js';
import type { ICredentialPresence } from './ports/credential-presence.js';
import { providerReadiness } from './provider-readiness.js';

const provider = (over: Partial<AiProvider>): AiProvider => ({
  id: 'p1',
  code: 'x',
  kind: 'anthropic',
  displayName: 'X',
  baseUrl: null,
  apiVersion: null,
  credentialRef: 'ANTHROPIC_API_KEY',
  region: 'us',
  enabled: false,
  ...over,
});

const env = (...set: string[]): ICredentialPresence => ({ isSet: (ref) => set.includes(ref) });

describe('providerReadiness', () => {
  it('fake needs nothing', () => {
    expect(providerReadiness(provider({ kind: 'fake', credentialRef: null }), env())).toEqual({
      configured: true,
      missing: [],
    });
  });

  it('a provider with a key is configured only when the variable is set', () => {
    expect(providerReadiness(provider({}), env()).missing).toEqual([
      'environment variable ANTHROPIC_API_KEY is not set',
    ]);
    expect(providerReadiness(provider({}), env('ANTHROPIC_API_KEY')).configured).toBe(true);
  });

  it('is independent of the enabled switch', () => {
    expect(providerReadiness(provider({ enabled: true }), env()).configured).toBe(false);
  });

  it('an OpenAI-compatible server needs a baseUrl but may be keyless', () => {
    const local = provider({ kind: 'openai_compatible', credentialRef: null });
    expect(providerReadiness(local, env()).missing).toEqual(['baseUrl is not set']);
    expect(providerReadiness({ ...local, baseUrl: 'http://ollama:11434/v1' }, env()).configured).toBe(true);
  });

  it('the Whisper sidecar is keyless but needs its baseUrl', () => {
    const whisper = provider({ kind: 'whisper_local', credentialRef: null, region: 'local' });
    expect(providerReadiness(whisper, env()).missing).toEqual(['baseUrl is not set']);
    expect(providerReadiness({ ...whisper, baseUrl: 'http://whisper:8000' }, env()).configured).toBe(true);
  });

  it('Azure needs key, endpoint and api version, and names each one missing', () => {
    const azure = provider({ kind: 'azure_openai', credentialRef: 'AZURE_OPENAI_API_KEY' });
    expect(providerReadiness(azure, env()).missing).toEqual([
      'environment variable AZURE_OPENAI_API_KEY is not set',
      'baseUrl is not set',
      'apiVersion is not set',
    ]);
    expect(
      providerReadiness(
        { ...azure, baseUrl: 'https://x.openai.azure.com', apiVersion: '2026-01-01' },
        env('AZURE_OPENAI_API_KEY'),
      ).configured,
    ).toBe(true);
  });
});
