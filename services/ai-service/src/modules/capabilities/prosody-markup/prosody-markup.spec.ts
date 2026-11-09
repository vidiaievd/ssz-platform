import { Result } from '../../../shared/kernel/result.js';
import type { AiGateway, GatewayCall } from '../../gateway/application/ai-gateway.js';
import type { GatewayInput, GatewayRequest } from '../../gateway/application/model-router.js';
import type { CallContext } from '../../ledger/domain/ai-call.js';
import { featureKeyOf } from '../../access/domain/entitlement.js';
import { findCapability } from '../catalog.js';
import { numberedText, phraseMarksSchema, readPhraseMarks, verifyPhraseMarks } from './domain/phrase-marks.js';
import { prosodyMarkupRequest, PROSODY_MARKUP_PROMPT_VERSIONS } from './prompts/prompts.js';
import {
  SuggestPhraseMarksCommand,
  type SuggestPhraseMarksRequest,
} from './application/suggest-phrase-marks/suggest-phrase-marks.command.js';
import {
  MAX_MARKUP_WORDS,
  SuggestPhraseMarksHandler,
} from './application/suggest-phrase-marks/suggest-phrase-marks.handler.js';

// Plan 86, step 5c.

const TEXT = 'Jeg heter Anna. Er du fra Norge?\nJa, jeg er fra Oslo.';

/** The words of a text as content-service counts them, near enough for these tests. */
function spansOf(text: string): Array<readonly [number, number]> {
  return [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => [m.index!, m.index! + m[0].length] as const);
}

const SPANS = spansOf(TEXT);
// 0 Jeg 1 heter 2 Anna 3 Er 4 du 5 fra 6 Norge 7 Ja 8 jeg 9 er 10 fra 11 Oslo

const group = (end: number, accent: number | null, pitch = 'fall', pause = 'long') => ({ end, accent, pitch, pause });

describe('prosody_markup', () => {
  it('is an agent sold under ai.authoring', () => {
    expect(findCapability('prosody_markup')).toMatchObject({ requiredFeatures: { structuredOutput: 'json_mode' } });
    expect(featureKeyOf('prosody_markup')).toBe('ai.authoring');
  });

  it('numbers every word after it and keeps what lies between', () => {
    expect(numberedText({ text: TEXT, spans: SPANS })).toBe(
      'Jeg⟨0⟩ heter⟨1⟩ Anna⟨2⟩. Er⟨3⟩ du⟨4⟩ fra⟨5⟩ Norge⟨6⟩?\nJa⟨7⟩, jeg⟨8⟩ er⟨9⟩ fra⟨10⟩ Oslo⟨11⟩.',
    );
  });

  describe('prosody_markup@1', () => {
    const request = prosodyMarkupRequest('prosody_markup@1', {
      targetLanguage: 'Norwegian Bokmål',
      text: TEXT,
      spans: SPANS,
    });

    it('asks for groups by index in the language named, the text numbered, the system cached', () => {
      expect(request.system).toContain('of a Norwegian Bokmål text');
      expect(request.system).toContain('never mark stress or toneme');
      expect(request.messages[0]!.parts[0]).toEqual({
        type: 'text',
        text: `Text:\n${numberedText({ text: TEXT, spans: SPANS })}`,
      });
      expect(request.responseSchema!.schema).toEqual(phraseMarksSchema(SPANS.length));
      expect(request.cacheBoundary).toBe(-1);
    });

    it('knows no other version', () => {
      expect(PROSODY_MARKUP_PROMPT_VERSIONS).toEqual(['prosody_markup@1']);
      expect(() => prosodyMarkupRequest('prosody_markup@9', { targetLanguage: 'x', text: '', spans: [] })).toThrow(
        'no prompt version',
      );
    });
  });

  describe('the answer', () => {
    const verify = verifyPhraseMarks(SPANS.length);

    it('wants groups in order with the accent inside, links inside a group', () => {
      expect(
        verify({
          groups: [group(2, 2), group(6, 6, 'rise'), group(7, 7, 'level', 'short'), group(11, 11)],
          links: [9],
        }),
      ).toBeNull();
      expect(verify({ groups: [group(6, 6), group(2, 2)], links: [] })).toBe('group 1 ends at 2, before its start 7');
      expect(verify({ groups: [group(2, 2), group(6, 1)], links: [] })).toBe('group 1 has its accent 1 outside 3–6');
      expect(verify({ groups: [group(2, 2)], links: [2] })).toBe('link 2 crosses a group end');
      expect(verify({ groups: [], links: [11] })).toBe('link 11 has no next word');
      expect(verify({ groups: [], links: [4, 4] })).toBe('link 4 given twice');
    });

    it('reads groups as accents and boundaries, and drops a link across punctuation', () => {
      const data = { groups: [group(2, 2), group(6, null, 'rise'), group(11, 11, 'fall', 'none')], links: [9, 7, 2] };
      expect(readPhraseMarks(data, { text: TEXT, spans: SPANS })).toEqual({
        accents: [2, 11],
        boundaries: [
          { index: 2, pitch: 'fall', pause: 'long' },
          { index: 6, pitch: 'rise', pause: 'long' },
          { index: 11, pitch: 'fall', pause: null },
        ],
        // 7 is «Ja,» and 2 is «Anna.»: punctuation follows both.
        links: [9],
      });
    });
  });

  describe('the suggestion', () => {
    const request = (over: Partial<SuggestPhraseMarksRequest> = {}): SuggestPhraseMarksRequest => ({
      schoolId: 'school-1',
      userId: 'author-1',
      language: 'nb',
      text: TEXT,
      spans: SPANS,
      ...over,
    });
    const answered = (data: unknown): GatewayCall =>
      ({
        routed: Result.ok({ result: { output: { kind: 'structured', data } } }),
        recorded: { callId: 'call-1', cost: null, credits: '0.02' },
        latencyMs: 5,
      }) as unknown as GatewayCall;
    const failedWith = (error: unknown): GatewayCall =>
      ({
        routed: Result.fail(error),
        recorded: { callId: 'call-1', cost: null, credits: null },
        latencyMs: 5,
      }) as unknown as GatewayCall;

    function run(call: GatewayCall | null, over: Partial<SuggestPhraseMarksRequest> = {}) {
      const seen: { capability?: string; context?: CallContext; request?: GatewayRequest } = {};
      const gateway = {
        call: async (capability: string, context: CallContext, input: GatewayInput) => {
          Object.assign(seen, {
            capability,
            context,
            request: typeof input === 'function' ? input('prosody_markup@1') : input,
          });
          return call!;
        },
      } as unknown as AiGateway;
      const outcome = new SuggestPhraseMarksHandler(gateway).execute(new SuggestPhraseMarksCommand(request(over)));
      return { outcome, seen };
    }

    it('asks the school’s ai.authoring under surface authoring and answers by word index', async () => {
      const { outcome, seen } = run(answered({ groups: [group(2, 2), group(6, 6, 'rise'), group(11, 11)], links: [] }));
      expect(await outcome).toEqual({
        status: 'ok',
        marks: {
          accents: [2, 6, 11],
          boundaries: [
            { index: 2, pitch: 'fall', pause: 'long' },
            { index: 6, pitch: 'rise', pause: 'long' },
            { index: 11, pitch: 'fall', pause: 'long' },
          ],
          links: [],
        },
        aiCallIds: ['call-1'],
      });
      expect(seen.capability).toBe('prosody_markup');
      expect(seen.context).toEqual({
        payer: { type: 'workspace', id: 'school-1' },
        actor: { userId: 'author-1', role: null },
        surface: 'authoring',
      });
      expect(seen.request!.system).toContain('Norwegian Bokmål');
    });

    it('charges the author without a school to their own plan', async () => {
      const { outcome, seen } = run(answered({ groups: [], links: [] }), { schoolId: null });
      await outcome;
      expect(seen.context!.payer).toEqual({ type: 'user', id: 'author-1' });
    });

    it('refuses before any call what it cannot mark', async () => {
      expect(await run(null, { language: 'en' }).outcome).toEqual({
        status: 'refused',
        reason: 'language_not_supported',
      });
      expect(await run(null, { text: '...', spans: [] }).outcome).toEqual({ status: 'refused', reason: 'no_words' });
      const long = Array.from({ length: MAX_MARKUP_WORDS + 1 }, (_, i) => [i * 2, i * 2 + 1] as const);
      expect(await run(null, { text: 'a '.repeat(long.length), spans: long }).outcome).toEqual({
        status: 'refused',
        reason: 'too_long',
      });
    });

    it('maps an agent off, a spent pool and a failed model', async () => {
      expect(await run(failedWith({ kind: 'disabled', binding: null })).outcome).toEqual({
        status: 'refused',
        reason: 'not_available',
      });
      expect(await run(failedWith({ kind: 'refused', code: 'quota_exhausted' })).outcome).toEqual({
        status: 'refused',
        reason: 'pool_empty',
      });
      expect(await run(failedWith({ kind: 'error', error: { code: 'timeout' }, attempts: [] })).outcome).toEqual({
        status: 'failed',
        errorCode: 'timeout',
        aiCallIds: ['call-1'],
      });
    });
  });
});
