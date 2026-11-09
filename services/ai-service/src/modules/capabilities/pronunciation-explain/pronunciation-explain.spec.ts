import { quotaPoolOf, featureKeyOf } from '../../access/domain/entitlement.js';
import { findCapability } from '../catalog.js';
import {
  explanationsSchema,
  readExplanations,
  verifyExplanations,
  type ExplainSoundsInput,
} from './domain/sound-explanations.js';
import { pronunciationExplainRequest, PRONUNCIATION_EXPLAIN_PROMPT_VERSIONS } from './prompts/prompts.js';
import { soundBaseFor, type SoundBaseEntry } from './domain/sound-base.js';
import { SoundExplainer } from './application/sound-explainer.js';
import type { AiGateway } from '../../gateway/application/ai-gateway.js';
import type { GatewayRequest } from '../../gateway/application/model-router.js';
import type { CallContext } from '../../ledger/domain/ai-call.js';
import { Result } from '../../../shared/kernel/result.js';

// Plan 88, step 5b.

const input = (over: Partial<ExplainSoundsInput> = {}): ExplainSoundsInput => ({
  targetLanguage: 'Norwegian Bokmål',
  explanationLanguage: 'Ukrainian',
  sounds: [
    { word: 'kjenner', transcription: 'çɛnər', family: 'kj', symbols: ['KJ'], severity: 'major' },
    { word: 'tak', transcription: 'tɑːk', family: 'vowel_length', symbols: ['AA'], severity: 'minor' },
    { word: 'kino', transcription: 'çiːnʊ', family: 'kj', symbols: ['KJ'], severity: 'minor' },
  ],
  ...over,
});

const KJ_BASE: SoundBaseEntry = {
  family: 'kj',
  locale: 'uk',
  title: 'Звук kj [ç]',
  description: 'М’яке шипіння в середині рота.',
  howTo: 'Підніміть середину язика до твердого піднебіння,\n кінчик тримайте внизу.',
  commonError: 'Зазвичай вимовляють м’яке «хь».',
  ukNote: 'Українське «х» перед «і» пом’якшується слабше.',
  drill: 'Скажіть «й» без голосу.',
  carrierWords: ['kjøkken', 'kino'],
};

describe('pronunciation_explain', () => {
  it('is an agent sold under the rehearsal’s key and pool', () => {
    expect(findCapability('pronunciation_explain')).toMatchObject({
      requiredFeatures: { structuredOutput: 'json_mode' },
    });
    expect(featureKeyOf('pronunciation_explain')).toBe('ai.practice');
    expect(quotaPoolOf('pronunciation_explain')).toBe('practice');
  });

  it('runs on hand-in as voice_review_explain, under the pronunciation level, with the same prompts (plan 88, step 5c.2)', () => {
    expect(findCapability('voice_review_explain')).toMatchObject({
      requiredFeatures: { structuredOutput: 'json_mode' },
      promptVersions: PRONUNCIATION_EXPLAIN_PROMPT_VERSIONS,
    });
    expect(featureKeyOf('voice_review_explain')).toBe('ai.voice_review_pronunciation');
  });

  describe('pronunciation_explain@1', () => {
    const request = pronunciationExplainRequest('pronunciation_explain@1', input());

    it('gives the notes of the families asked about, each sound once, and a length remark the other length', () => {
      expect(request.system).toContain('in Ukrainian');
      expect(request.system).toContain('learner of Norwegian Bokmål');
      expect(request.system.match(/\[ç\] kj-sound/g)).toHaveLength(1);
      expect(request.system).toContain('- Long and short vowels\n  - [ɑː] Long open back a');
      expect(request.system).toContain('  - [ɑ] Short open back a');
      expect(request.system).not.toContain('sj / skj');
    });

    it('lists the remarks by index, word, transcription, family and severity', () => {
      expect(request.messages[0]!.parts[0]).toEqual({
        type: 'text',
        text: [
          'Remarks:',
          '0. «kjenner» [çɛnər] — kj-sound [ç], major',
          '1. «tak» [tɑːk] — Long and short vowels, minor',
          '2. «kino» [çiːnʊ] — kj-sound [ç], minor',
        ].join('\n'),
      });
      expect(request.responseSchema!.schema).toEqual(explanationsSchema(3));
    });

    it('ignores the articulation base', () => {
      const withBase = pronunciationExplainRequest('pronunciation_explain@1', input({ base: soundBaseFor([KJ_BASE], 'uk') }));
      expect(withBase.system).toBe(request.system);
      expect(withBase.messages).toEqual(request.messages);
    });

    it('knows no other version', () => {
      expect(PRONUNCIATION_EXPLAIN_PROMPT_VERSIONS).toEqual(['pronunciation_explain@1', 'pronunciation_explain@2']);
      expect(() => pronunciationExplainRequest('pronunciation_explain@9', input())).toThrow('no prompt version');
    });
  });

  describe('the answer', () => {
    const verify = verifyExplanations(2);
    const item = (index: number, explanation = 'Так.') => ({ index, explanation });

    it('wants every remark explained once and a summary', () => {
      expect(verify({ items: [item(1), item(0)], summary: 'Почніть з kj.' })).toBeNull();
      expect(verify({ items: [item(0)], summary: 'x' })).toBe('1 remark(s) not explained');
      expect(verify({ items: [item(0), item(0)], summary: 'x' })).toBe('remark 0 explained twice');
      expect(verify({ items: [item(0), item(1, '  ')], summary: 'x' })).toBe('remark 1 explained blank');
      expect(verify({ items: [item(0), item(1)], summary: ' ' })).toBe('summary is blank');
    });

    it('reads the explanations in the order of the remarks', () => {
      expect(readExplanations({ items: [item(1, ' Б '), item(0, 'А')], summary: ' Підсумок ' }, 2)).toEqual({
        explanations: ['А', 'Б'],
        summary: 'Підсумок',
      });
    });
  });

  describe('pronunciation_explain@2 (plan 86, step 9.2)', () => {
    const v2 = (over: Partial<ExplainSoundsInput> = {}) => pronunciationExplainRequest('pronunciation_explain@2', input(over));

    it('joins the inventory note of a family with its base, one line per text, in the base’s language', () => {
      const { system } = v2({ base: soundBaseFor([KJ_BASE], 'uk') });
      const kj = system.slice(system.indexOf('- kj-sound [ç]'), system.indexOf('- Long and short vowels'));
      expect(kj.split('\n')).toEqual([
        '- kj-sound [ç]',
        expect.stringMatching(/^ {2}- \[ç\] /),
        '  (written in Ukrainian)',
        '  What it is: М’яке шипіння в середині рота.',
        '  How to say it: Підніміть середину язика до твердого піднебіння, кінчик тримайте внизу.',
        '  Usual mistake of speakers of Russian and Ukrainian: Зазвичай вимовляють м’яке «хь».',
        '  Where Ukrainian speakers differ: Українське «х» перед «і» пом’якшується слабше.',
        '  Drill: Скажіть «й» без голосу.',
        '  Practice words: kjøkken, kino',
        '',
      ]);
      expect(system.match(/What it is:/g)).toHaveLength(1);
    });

    it('keeps the inventory notes alone for a family the base lacks, and for no base at all', () => {
      const withBase = v2({ base: soundBaseFor([KJ_BASE], 'uk') }).system;
      expect(withBase).toContain('- Long and short vowels\n  - [ɑː] Long open back a');
      expect(withBase.slice(withBase.indexOf('- Long and short vowels'))).not.toContain('How to say it:');
      expect(v2().system).not.toContain('How to say it:');
    });

    it('warns the model off turning the usual mistake into what the learner said', () => {
      expect(v2().system).toContain('never as "you said"');
      expect(v2().system).toContain('Never say or guess what the learner actually said');
    });

    it('asks the same remarks with the same schema as v1', () => {
      const v1 = pronunciationExplainRequest('pronunciation_explain@1', input());
      expect(v2().messages).toEqual(v1.messages);
      expect(v2().responseSchema!.schema).toEqual(v1.responseSchema!.schema);
    });
  });

  describe('the base as the learner is told it', () => {
    it('offers the usual mistake to readers of Russian and Ukrainian, the Ukrainian note to Ukrainian only', () => {
      expect(soundBaseFor([KJ_BASE], 'uk').get('kj')).toMatchObject({ commonError: KJ_BASE.commonError, ukNote: KJ_BASE.ukNote });
      expect(soundBaseFor([KJ_BASE], 'ru').get('kj')).toMatchObject({ commonError: KJ_BASE.commonError, ukNote: null });
      expect(soundBaseFor([KJ_BASE], 'en').get('kj')).toMatchObject({ commonError: null, ukNote: null, howTo: KJ_BASE.howTo });
      expect(soundBaseFor([KJ_BASE], 'nb').get('kj')).toMatchObject({ commonError: null, ukNote: null });
    });
  });

  describe('SoundExplainer', () => {
    const context = { payer: { type: 'workspace', id: 's' }, actor: { userId: 'u', role: 'student' }, surface: 'precheck' } as CallContext;
    const answer = { items: [0, 1, 2].map((index) => ({ index, explanation: `e${index}` })), summary: 'Почніть з kj.' };

    function setup(base: () => Promise<SoundBaseEntry[]>) {
      const asked: Array<{ capability: string; request: GatewayRequest }> = [];
      const bases: Array<[string, string]> = [];
      const gateway = {
        call: async (capability: string, _context: CallContext, build: (version: string) => GatewayRequest) => {
          asked.push({ capability, request: build('pronunciation_explain@2') });
          return {
            routed: Result.ok({ result: { output: { kind: 'structured', data: answer } } }),
            recorded: { callId: 'c1', cost: null, credits: null },
          };
        },
      } as unknown as AiGateway;
      const explainer = new SoundExplainer(gateway, {
        base: (language, locale) => (bases.push([language, locale]), base()),
      });
      const run = (explanationLanguage = 'uk-UA') =>
        explainer.explain({ capability: 'voice_review_explain', context, targetLanguage: 'nb', explanationLanguage, sounds: input().sounds, what: 'a test' });
      return { run, asked, bases };
    }

    it('reads the base of the language in the explanation locale and hands it to the prompt', async () => {
      const { run, asked, bases } = setup(async () => [KJ_BASE]);
      const { explanations } = await run();
      expect(bases).toEqual([['nb', 'uk']]);
      expect(asked[0]!.capability).toBe('voice_review_explain');
      expect(asked[0]!.request.system).toContain('in Ukrainian');
      expect(asked[0]!.request.system).toContain('Where Ukrainian speakers differ:');
      expect(explanations).toEqual({ explanations: ['e0', 'e1', 'e2'], summary: 'Почніть з kj.' });
    });

    it('explains from the inventory when the base cannot be read', async () => {
      const { run, asked } = setup(async () => {
        throw new Error('content-service down');
      });
      const { explanations } = await run('ru');
      expect(asked[0]!.request.system).not.toContain('How to say it:');
      expect(asked[0]!.request.system).toContain('[ç] kj-sound');
      expect(explanations?.summary).toBe('Почніть з kj.');
    });
  });
});
