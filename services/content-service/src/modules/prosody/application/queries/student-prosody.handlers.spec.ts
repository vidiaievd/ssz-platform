import { parseProsodyNotation } from '@ssz/shared-kernel/prosody';
import type { WordSounds, WordStress } from '@ssz/shared-kernel/prosody';
import { Result } from '../../../../shared/kernel/result.js';
import type { IProsodyLayerRepository } from '../../domain/repositories/prosody-layer.repository.interface.js';
import type { IProsodyTextReader } from '../../domain/repositories/prosody-text.reader.interface.js';
import type { ILexiconStressSource } from '../ports/lexicon-stress.source.js';
import { GetExerciseProsodyHandler } from './get-exercise-prosody/get-exercise-prosody.handler.js';
import { GetExerciseProsodyQuery } from './get-exercise-prosody/get-exercise-prosody.query.js';
import { GetLessonProsodyHandler } from './get-lesson-prosody/get-lesson-prosody.handler.js';
import { GetLessonProsodyQuery } from './get-lesson-prosody/get-lesson-prosody.query.js';

// Plan 86, step 5b: the student's layer is the lexicon's words with the author's marks over them.

const HETER: WordStress = {
  i: 1,
  w: 'heter',
  toneme: 2,
  vowel: { s: 1, e: 2, long: true },
  source: 'lexicon',
};

function lexiconOf(
  byText: Record<string, WordStress[]>,
  soundsByText: Record<string, WordSounds[]> = {},
) {
  const wordsOf = jest.fn((_language: string, text: string) =>
    Promise.resolve({ stresses: byText[text] ?? [], sounds: soundsByText[text] ?? [] }),
  );
  const source: ILexiconStressSource = { wordsOf };
  return { source, wordsOf };
}

describe('GetExerciseProsodyHandler', () => {
  const PASSAGE = 'Jeg heter Anna.';

  function setup(source: ILexiconStressSource, notation?: string) {
    const texts = {
      readAloudPassages: jest.fn().mockResolvedValue(
        Result.ok({
          language: 'nb',
          mode: 'read',
          prompts: [
            { id: 'p1', text: PASSAGE },
            { id: 'p2', text: ' ' },
          ],
        }),
      ),
    } as unknown as IProsodyTextReader;
    const stored = new Map();
    if (notation) {
      const parsed = parseProsodyNotation(notation);
      stored.set('p1', { sourceText: parsed.text, layer: parsed.layer });
    }
    const layers = {
      findForExercise: jest.fn().mockResolvedValue(stored),
    } as unknown as IProsodyLayerRepository;
    return new GetExerciseProsodyHandler(texts, layers, source);
  }

  it('gives an unmarked passage the lexicon words alone', async () => {
    const { source, wordsOf } = lexiconOf({ [PASSAGE]: [HETER] });
    const result = await setup(source).execute(new GetExerciseProsodyQuery('e1', 'live'));

    expect(result.value.prompts).toHaveLength(1);
    expect(result.value.prompts[0].layer.stresses).toEqual([HETER]);
    expect(result.value.prompts[0].sounds).toEqual([]);
    expect(wordsOf).toHaveBeenCalledTimes(1);
    expect(wordsOf).toHaveBeenCalledWith('nb', PASSAGE);
  });

  it("lays the author's marks over the lexicon", async () => {
    const { source } = lexiconOf({ [PASSAGE]: [HETER] });
    const result = await setup(source, "Jeg '1heter ^'1Anna \\ |").execute(
      new GetExerciseProsodyQuery('e1', 'live'),
    );
    const layer = result.value.prompts[0].layer;

    // The author's toneme wins; the vowel is the lexicon's, so its length is kept.
    expect(layer.stresses.map((s) => [s.w, s.toneme, s.source, s.vowel.long])).toEqual([
      ['heter', 1, 'teacher', true],
      ['Anna', 1, 'teacher', null],
    ]);
    expect(layer.accents.map((a) => a.w)).toEqual(['Anna']);
  });
});

describe('GetLessonProsodyHandler', () => {
  it('asks for the whole body once and cuts the words into paragraphs', async () => {
    const body = '## Hei\n\nJeg heter Anna.';
    const words: WordStress[] = [
      { i: 0, w: 'Hei', toneme: null, vowel: { s: 1, e: 3, long: true }, source: 'lexicon' },
      { ...HETER, i: 2 },
    ];
    const sounds: WordSounds[] = [
      { i: 0, w: 'Hei', segs: [] },
      { i: 3, w: 'Anna', segs: [] },
    ];
    const { source, wordsOf } = lexiconOf({ [body]: words }, { [body]: sounds });
    const texts = {
      lessonBody: jest.fn().mockResolvedValue(Result.ok({ text: body, language: 'nb' })),
    } as unknown as IProsodyTextReader;
    const layers = {
      find: jest.fn().mockResolvedValue(null),
    } as unknown as IProsodyLayerRepository;

    const result = await new GetLessonProsodyHandler(texts, layers, source).execute(
      new GetLessonProsodyQuery('l1', 'v1'),
    );

    expect(wordsOf).toHaveBeenCalledWith('nb', body);
    expect(result.value.paragraphs.map((p) => p.layer.stresses.map((s) => [s.i, s.w]))).toEqual([
      [[0, 'Hei']],
      [[1, 'heter']],
    ]);
    // The sounds are cut with the paragraphs: *Anna* is the third word of the second one.
    expect(result.value.paragraphs.map((p) => p.sounds.map((x) => [x.i, x.w]))).toEqual([
      [[0, 'Hei']],
      [[2, 'Anna']],
    ]);
  });
});
