import { parseProsodyNotation } from '@ssz/shared-kernel/prosody';
import type { IProsodyLayerRepository } from '../domain/repositories/prosody-layer.repository.interface.js';
import type { ILexiconStressSource } from './ports/lexicon-stress.source.js';
import { ReadAloudGuideService } from './read-aloud-guide.service.js';

// Plan 86, step 6h.2c: the preflight's inputs for `guideIssues`, against the text it judges.

const SAVED = 'Bartek søker jobb.';
const DRAFT = 'I dag søker Bartek jobb.';

function setup() {
  const layers: IProsodyLayerRepository = {
    find: jest.fn(),
    findForExercise: jest.fn().mockResolvedValue(
      new Map([
        [
          'p1',
          {
            sourceText: SAVED,
            layer: parseProsodyNotation("'0Bartek søker jobb.").layer,
            updatedAt: new Date(),
          },
        ],
      ]),
    ),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const wordsOf = jest.fn((_language: string, text: string) =>
    Promise.resolve({
      stresses: [],
      sounds: [],
      unresolved: text === DRAFT ? [{ i: 3, w: 'Bartek' }] : [],
    }),
  );
  const lexicon: ILexiconStressSource = { wordsOf };
  return { wordsOf, service: new ReadAloudGuideService(layers, lexicon) };
}

describe('ReadAloudGuideService', () => {
  it('follows the stored layer to the text judged and asks the lexicon about that text', async () => {
    const { wordsOf, service } = setup();
    const guide = await service.guideOf('e1', 'nb', [
      { id: 'p1', text: DRAFT },
      { id: 'p2', text: '  ' },
    ]);

    expect(Object.keys(guide)).toEqual(['p1']);
    expect(guide.p1?.layer.unstressed).toEqual([{ i: 3, w: 'Bartek', source: 'teacher' }]);
    expect(guide.p1?.unresolved).toEqual([{ i: 3, w: 'Bartek' }]);
    expect(wordsOf).toHaveBeenCalledTimes(1);
  });

  it('reads nothing for an exercise without passages', async () => {
    const { wordsOf, service } = setup();
    expect(await service.guideOf('e1', 'nb', [])).toEqual({});
    expect(wordsOf).not.toHaveBeenCalled();
  });
});
