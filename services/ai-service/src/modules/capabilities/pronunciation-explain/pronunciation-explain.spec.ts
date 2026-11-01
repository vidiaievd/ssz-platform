import { quotaPoolOf, featureKeyOf } from '../../access/domain/entitlement.js';
import { findCapability } from '../catalog.js';
import {
  explanationsSchema,
  readExplanations,
  verifyExplanations,
  type ExplainSoundsInput,
} from './domain/sound-explanations.js';
import { pronunciationExplainRequest, PRONUNCIATION_EXPLAIN_PROMPT_VERSIONS } from './prompts/prompts.js';

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

    it('knows no other version', () => {
      expect(PRONUNCIATION_EXPLAIN_PROMPT_VERSIONS).toEqual(['pronunciation_explain@1']);
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
});
