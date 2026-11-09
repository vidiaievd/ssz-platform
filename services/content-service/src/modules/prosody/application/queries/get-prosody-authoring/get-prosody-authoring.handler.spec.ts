import { parseProsodyNotation } from '@ssz/shared-kernel/prosody';
import { Result } from '../../../../../shared/kernel/result.js';
import type { IProsodyLayerRepository } from '../../../domain/repositories/prosody-layer.repository.interface.js';
import type { IProsodyTextReader } from '../../../domain/repositories/prosody-text.reader.interface.js';
import type { ProsodyOwner } from '../../../domain/prosody-owner.js';
import type { ILexiconStressSource, LexiconWords } from '../../ports/lexicon-stress.source.js';
import { GetProsodyAuthoringQuery } from './get-prosody-authoring.query.js';
import { GetProsodyAuthoringHandler } from './get-prosody-authoring.handler.js';

// Plan 86, step 6h.2: the editor reads the stored layer with the lexicon's words beside it.

const TEXT = 'Bartek søker ny jobb.';
const prompt: ProsodyOwner = { kind: 'exercise', exerciseId: 'e1', promptId: 'p1' };

const WORDS: LexiconWords = {
  stresses: [{ i: 1, w: 'søker', toneme: 2, vowel: { s: 1, e: 2, long: true }, source: 'lexicon' }],
  sounds: [],
  unresolved: [{ i: 0, w: 'Bartek' }],
};

function setup(stored: string | null) {
  const texts: IProsodyTextReader = {
    lessonBody: jest.fn(),
    readAloudPassages: jest.fn().mockResolvedValue(
      Result.ok({
        language: 'nb',
        ownerSchoolId: null,
        mode: 'read',
        prompts: [{ id: 'p1', text: TEXT }],
      }),
    ),
  };
  const layers: IProsodyLayerRepository = {
    find: jest.fn().mockResolvedValue(
      stored === null
        ? null
        : {
            sourceText: TEXT,
            layer: parseProsodyNotation(stored).layer,
            updatedAt: new Date('2026-11-04T10:00:00Z'),
          },
    ),
    findForExercise: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const wordsOf = jest.fn().mockResolvedValue(WORDS);
  const lexicon: ILexiconStressSource = { wordsOf };
  return { wordsOf, handler: new GetProsodyAuthoringHandler(texts, layers, lexicon) };
}

describe('GetProsodyAuthoringHandler', () => {
  it('returns the stored layer with the lexicon words of the same text', async () => {
    const { wordsOf, handler } = setup("'0Bartek søker ny jobb.");
    const result = await handler.execute(new GetProsodyAuthoringQuery(prompt));

    expect(result.isOk).toBe(true);
    expect(wordsOf).toHaveBeenCalledWith('nb', TEXT);
    expect(result.value.lexicon).toEqual(WORDS);
    expect(result.value.layer.unstressed).toEqual([{ i: 0, w: 'Bartek', source: 'teacher' }]);
    expect(result.value.updatedAt).toEqual(new Date('2026-11-04T10:00:00Z'));
  });

  it('answers the lexicon words over an empty layer when nothing is stored', async () => {
    const { handler } = setup(null);
    const result = await handler.execute(new GetProsodyAuthoringQuery(prompt));

    expect(result.value.lexicon.unresolved).toEqual([{ i: 0, w: 'Bartek' }]);
    expect(result.value.notation).toBe(TEXT);
    expect(result.value.updatedAt).toBeNull();
  });
});
