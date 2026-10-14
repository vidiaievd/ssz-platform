import { ConfigVoiceResolver } from '../../../../src/infrastructure/tts/config-voice-resolver.js';

const config = { get: jest.fn().mockReturnValue({ piperVoice: 'no_NO-talesyntese-medium' }) };

describe('ConfigVoiceResolver', () => {
  const resolver = new ConfigVoiceResolver(config as any);

  it('maps every Norwegian tag to the one piper voice', () => {
    for (const lang of ['nb', 'nn', 'no', 'nb-NO', 'NO_no']) {
      expect(resolver.resolve(lang, null)).toEqual({ voice: 'no_NO-talesyntese-medium', family: 'no' });
    }
  });

  it('gives every speaker the same voice while there is only one (D1)', () => {
    expect(resolver.resolve('nb', 'Silje')).toEqual(resolver.resolve('nb', 'Taras'));
  });

  it('returns null for a language no voice speaks', () => {
    expect(resolver.resolve('en', null)).toBeNull();
    expect(resolver.resolve('', null)).toBeNull();
  });
});
