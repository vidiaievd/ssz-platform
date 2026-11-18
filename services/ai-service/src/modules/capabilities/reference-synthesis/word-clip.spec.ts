import type { AiGateway } from '../../gateway/application/ai-gateway.js';
import type { CallContext } from '../../ledger/domain/ai-call.js';
import type { PronouncedWord } from '../../providers/domain/speech-result.js';
import { Result } from '../../../shared/kernel/result.js';
import { MakeWordClipCommand } from './application/make-word-clip/make-word-clip.command.js';
import { MakeWordClipHandler } from './application/make-word-clip/make-word-clip.handler.js';
import { toWordClipResponse } from './presentation/reference-clip.dto.js';

const VOICES = ['nb-NO-PernilleNeural', 'nb-NO-FinnNeural', 'nb-NO-IselinNeural'];

interface Setup {
  voices?: string[];
  words?: (word: string) => PronouncedWord[];
  synthesis?: unknown;
  speech?: unknown;
}

function setup(options: Setup = {}) {
  const contexts: CallContext[] = [];
  const texts: string[] = [];
  const gateway = {
    voicesOf: jest.fn(async () => options.voices ?? VOICES),
    callSynthesis: jest.fn(async (_c: string, context: CallContext, request: { text: string; voice: string }) => {
      contexts.push(context);
      texts.push(request.text);
      const routed =
        (options.synthesis as never) ??
        Result.ok({
          result: { audio: { format: 'wav', data: new Uint8Array([7, 8]) }, audioMs: 640, voice: request.voice, characters: 5 },
        });
      return { routed, recorded: { callId: 'tts-1', cost: null, credits: '0.0001' }, latencyMs: 5 };
    }),
    callSpeech: jest.fn(async (_c: string, context: CallContext, request: { referenceText: string }) => {
      contexts.push(context);
      texts.push(request.referenceText);
      const words = options.words?.(request.referenceText) ?? [
        { text: request.referenceText, accuracy: 98, error: 'none', phonemes: [] },
      ];
      const routed =
        (options.speech as never) ??
        Result.ok({
          result: { transcript: '', words: [], pronunciation: { accuracy: 98, fluency: 98, completeness: 100, prosody: null, words } },
        });
      return { routed, recorded: { callId: 'check-1', cost: null, credits: '0.0002' }, latencyMs: 5 };
    }),
  };
  const handler = new MakeWordClipHandler(gateway as unknown as AiGateway);
  const make = (word: string, voice = 'nb-NO-FinnNeural', language = 'nb') =>
    handler.execute(new MakeWordClipCommand({ language, word, voice }));
  return { make, gateway, contexts, texts };
}

describe('word clips (plan 86, step 4z.2)', () => {
  it('speaks the word alone with the voice asked for, hears it back, the platform paying', async () => {
    const { make, gateway, contexts, texts } = setup();
    const outcome = await make('Kjære');
    expect(outcome).toEqual({
      status: 'ok',
      clip: { audio: new Uint8Array([7, 8]), audioMs: 640, voice: 'nb-NO-FinnNeural', accuracy: 98 },
      aiCallIds: ['tts-1', 'check-1'],
    });
    expect(texts).toEqual(['kjære', 'kjære']);
    expect(gateway.callSynthesis.mock.calls[0]![2]).toMatchObject({ voice: 'nb-NO-FinnNeural', language: 'nb' });
    expect(contexts.every((c) => c.payer.type === 'platform' && c.surface === 'authoring')).toBe(true);
  });

  it('answers the audio as base64', async () => {
    const { make } = setup();
    const body = toWordClipResponse(await make('kjære'));
    expect(body.clip?.wav).toBe(Buffer.from([7, 8]).toString('base64'));
  });

  it('refuses more than one word, and a voice the model does not have, before any call', async () => {
    const { make, gateway } = setup();
    expect(await make('kjære venn')).toEqual({ status: 'refused', reason: 'not_a_word' });
    expect(await make('kjære', 'nb-NO-Ola')).toEqual({ status: 'refused', reason: 'not_available' });
    expect(gateway.callSynthesis).not.toHaveBeenCalled();
  });

  it('rejects a clip heard as another word or below the floor', async () => {
    const other = setup({ words: () => [{ text: 'skjære', accuracy: 97, error: 'none', phonemes: [] }] });
    expect(await other.make('kjære')).toMatchObject({ status: 'rejected', voice: 'nb-NO-FinnNeural', accuracy: null });
    const low = setup({ words: (w) => [{ text: w, accuracy: 41, error: 'none', phonemes: [] }] });
    expect(await low.make('kjære')).toMatchObject({ status: 'rejected', accuracy: 41 });
  });

  it('is not_available when synthesis is switched off, failed when a model does not answer', async () => {
    const off = setup({ synthesis: Result.fail({ kind: 'disabled' }) });
    expect(await off.make('kjære')).toEqual({ status: 'refused', reason: 'not_available' });
    const down = setup({ speech: Result.fail({ kind: 'error', error: { code: 'provider_timeout' } }) });
    expect(await down.make('kjære')).toEqual({
      status: 'failed',
      errorCode: 'provider_timeout',
      aiCallIds: ['tts-1', 'check-1'],
    });
  });
});
