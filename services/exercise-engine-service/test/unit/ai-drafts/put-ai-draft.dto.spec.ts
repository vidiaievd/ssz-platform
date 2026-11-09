import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AiDraftBodyDto } from '../../../src/modules/ai-drafts/presentation/dto/put-ai-draft.dto.js';
import { PutAiReviewDto, toHearings } from '../../../src/modules/ai-drafts/presentation/dto/put-ai-review.dto.js';

// Plan 85, step 3b: a draft remark may name the grammar atom it is about.
// Plan 88, step 5c: or the sound of a reading's word, and the words carry their sounds.

const ATOM = 'f056f89e-fac6-4ec3-bfc3-db24a23db27a';

const body = (remark: Record<string, unknown>) => ({
  status: 'ready',
  items: [{ itemId: 's1', sentenceIndex: 1, aspect: 'grammar', fragment: 'bor', comment: 'Время?', suggestion: null, ...remark }],
  summary: null,
  aiCallId: '7d1f0a52-1c3e-4c8e-9b7a-0f2d3e4a5b6c',
});

// The service's own pipe: an unknown property is an error, not dropped.
const errorsOf = async (plain: unknown) =>
  validate(plainToInstance(AiDraftBodyDto, plain) as object, { whitelist: true, forbidNonWhitelisted: true });

describe('AiDraftBodyDto atomRef', () => {
  it('accepts a remark without one, with null, and with a grammar atom', async () => {
    expect(await errorsOf(body({}))).toEqual([]);
    expect(await errorsOf(body({ atomRef: null }))).toEqual([]);
    expect(await errorsOf(body({ atomRef: { atomType: 'grammar_rule_atom', atomId: ATOM } }))).toEqual([]);
  });

  it('refuses another atom type, an id that is not one, and stray fields', async () => {
    expect(await errorsOf(body({ atomRef: { atomType: 'vocabulary_item', atomId: ATOM } }))).not.toEqual([]);
    expect(await errorsOf(body({ atomRef: { atomType: 'grammar_rule_atom', atomId: 'x' } }))).not.toEqual([]);
    expect(await errorsOf(body({ atomRef: { atomType: 'grammar_rule_atom', atomId: ATOM, extra: 1 } }))).not.toEqual([]);
  });
});

describe('AiDraftBodyDto sound remarks (plan 88, step 5c)', () => {
  const sound = (over: Record<string, unknown> = {}) =>
    body({ aspect: 'pronunciation', fragment: 'kjører', wordIndex: 2, atomRef: { atomType: 'sound', atomId: 'nb:kj' }, ...over });

  it('accepts a pronunciation remark on a word, filed under a sound family', async () => {
    expect(await errorsOf(sound())).toEqual([]);
    expect(await errorsOf(sound({ atomRef: { atomType: 'sound', atomId: 'nb:vowel_length' } }))).toEqual([]);
  });

  it('refuses a sound id that is not `<language>:<family>`, a UUID under sound, and a negative word', async () => {
    expect(await errorsOf(sound({ atomRef: { atomType: 'sound', atomId: 'kj' } }))).not.toEqual([]);
    expect(await errorsOf(sound({ atomRef: { atomType: 'sound', atomId: ATOM } }))).not.toEqual([]);
    expect(await errorsOf(sound({ atomRef: { atomType: 'grammar_rule_atom', atomId: 'nb:kj' } }))).not.toEqual([]);
    expect(await errorsOf(sound({ wordIndex: -1 }))).not.toEqual([]);
  });
});

describe('PutAiReviewDto reading words with sounds (plan 88, step 5c)', () => {
  const review = (phonemes: unknown) => ({
    ...body({ aspect: 'pronunciation', fragment: 'kjør', wordIndex: 0, atomRef: { atomType: 'sound', atomId: 'nb:kj' } }),
    reading: {
      prompts: [
        {
          itemId: 's1',
          transcript: 'kjør',
          words: [{ text: 'kjør', startMs: 0, endMs: 400 }],
          pronunciation: {
            accuracy: 60,
            fluency: 80,
            completeness: 100,
            words: [{ text: 'kjør', accuracy: 60, error: 'mispronunciation', ...(phonemes === undefined ? {} : { phonemes }) }],
          },
        },
      ],
    },
  });
  const reviewErrors = async (plain: unknown) =>
    validate(plainToInstance(PutAiReviewDto, plain) as object, { whitelist: true, forbidNonWhitelisted: true });

  it('accepts words with and without their sounds, an unnamed one included', async () => {
    expect(await reviewErrors(review(undefined))).toEqual([]);
    expect(await reviewErrors(review([{ symbol: 'ç', accuracy: 12 }, { symbol: '', accuracy: 80 }, { symbol: 'ʉː', accuracy: 70 }]))).toEqual([]);
  });

  it('refuses a sound out of range or with stray fields', async () => {
    expect(await reviewErrors(review([{ symbol: 'ç', accuracy: 120 }]))).not.toEqual([]);
    expect(await reviewErrors(review([{ symbol: 'ç', accuracy: 12, startMs: 0 }]))).not.toEqual([]);
  });

  it('hands the sounds on to the command, and leaves a word without them as it came', () => {
    const dto = plainToInstance(PutAiReviewDto, review([{ symbol: 'ç', accuracy: 12 }]));
    const bare = plainToInstance(PutAiReviewDto, review(undefined));
    expect(toHearings(dto.reading!)[0]!.pronunciation!.words[0]!.phonemes).toEqual([{ symbol: 'ç', accuracy: 12 }]);
    expect(toHearings(bare.reading!)[0]!.pronunciation!.words[0]).not.toHaveProperty('phonemes');
  });
});
