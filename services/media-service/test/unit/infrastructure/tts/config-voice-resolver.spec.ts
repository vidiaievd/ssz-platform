import { ConfigVoiceResolver } from '../../../../src/infrastructure/tts/config-voice-resolver.js';
import { VOICE_CATALOG } from '../../../../src/infrastructure/tts/voice-catalog.js';

const resolverWith = (tts: { piperVoice?: string; hiddenVoices?: string[] } = {}) =>
  new ConfigVoiceResolver({
    get: jest.fn().mockReturnValue({ piperVoice: 'no_NO-talesyntese-medium', hiddenVoices: [], ...tts }),
  } as any);

describe('ConfigVoiceResolver', () => {
  const resolver = resolverWith();

  it('maps every Norwegian tag to the configured default voice, as before the catalog', () => {
    for (const lang of ['nb', 'nn', 'no', 'nb-NO', 'NO_no']) {
      expect(resolver.resolve(lang, null)).toMatchObject({
        id: 'talesyntese',
        voice: 'no_NO-talesyntese-medium',
        family: 'no',
      });
    }
    expect(resolver.resolve('nb', null)).not.toHaveProperty('speaker');
  });

  it('gives every character the default voice for now (D1)', () => {
    expect(resolver.resolve('nb', 'Silje')).toEqual(resolver.resolve('nb', 'Taras'));
  });

  it('returns null for a language no voice speaks', () => {
    expect(resolver.resolve('en', null)).toBeNull();
    expect(resolver.resolve('', null)).toBeNull();
    expect(resolver.list('en')).toEqual([]);
    expect(resolver.byId('en', 'talesyntese')).toBeNull();
  });

  it('offers all eleven voices, the default first, five of them female', () => {
    const voices = resolver.list('nb');
    expect(voices).toHaveLength(VOICE_CATALOG.length);
    expect(voices[0]!.id).toBe('talesyntese');
    expect(voices.filter((v) => v.gender === 'female')).toHaveLength(5);
    expect(new Set(voices.map((v) => v.id)).size).toBe(voices.length);
  });

  it('finds a voice by id with its speaker, and refuses an unknown one', () => {
    expect(resolver.byId('nb', 'nvcc-kon')).toMatchObject({
      voice: 'no_NO-nvcc-medium',
      speaker: 'KON',
      gender: 'female',
    });
    expect(resolver.byId('nb', 'nvcc-zzz')).toBeNull();
  });

  it('hides a voice switched off in config, and falls back to the first one left when the default is hidden', () => {
    const hiding = resolverWith({ hiddenVoices: ['nvcc-kon', 'nvcc-mon'] });
    expect(hiding.list('nb').map((v) => v.id)).not.toContain('nvcc-kon');
    expect(hiding.byId('nb', 'nvcc-kon')).toBeNull();

    const noDefault = resolverWith({ hiddenVoices: ['talesyntese'] });
    expect(noDefault.resolve('nb', null)!.id).toBe('nvcc-kon');
  });
});
