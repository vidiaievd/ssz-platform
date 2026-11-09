jest.mock('../../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { GetSoundAtomDrillHandler } from './sound-atom-drill.handler.js';
import { GetSoundAtomDrillQuery } from './sound-atom-drill.query.js';

// Plan 86, step 13.2: the drill material of the scored sounds, words only with a reference clip.

const KJ = {
  id: 'nb:kj',
  family: 'kj',
  drill: {
    words: ['kjøre', 'kino', 'kirke'],
    pairs: [],
    diagnostic: 'kjenne',
    phrases: [
      { text: 'Vi skal kjøre til kino.', carriers: ['kjøre', 'kino'], source: 'uttale-02-4:p2' },
      { text: 'Kom inn i kjøkkenet!', carriers: ['kjøkkenet'], source: 'uttale-05-5:p4' },
    ],
  },
};

const LENGTH = {
  id: 'nb:vowel_length',
  family: 'vowel_length',
  drill: {
    words: ['tak', 'fin'],
    pairs: [
      ['tak', 'takk'],
      ['fin', 'finn'],
    ],
    diagnostic: 'tak',
    phrases: [],
  },
};

const clip = (word: string, tone: number | null = null) => ({
  language: 'nb',
  word,
  assetId: `asset-${word}`,
  tone,
  refusal: null,
  checkedAt: new Date(),
});

function makeHandler(options: { rows?: unknown[]; clips?: unknown[]; cached?: unknown } = {}) {
  const prisma = {
    soundAtom: { findMany: jest.fn().mockResolvedValue(options.rows ?? []) },
    soundReferenceClip: { findMany: jest.fn().mockResolvedValue(options.clips ?? []) },
  };
  const cache = {
    get: jest.fn().mockResolvedValue(options.cached ?? null),
    set: jest.fn().mockResolvedValue(undefined),
  };
  const handler = new GetSoundAtomDrillHandler(prisma as any, cache as any);
  return { handler, prisma, cache };
}

describe('GetSoundAtomDrillHandler', () => {
  it('offers only words with a clip, keeps every phrase, and caches the whole language', async () => {
    const { handler, prisma, cache } = makeHandler({
      rows: [KJ],
      clips: [clip('kjøre', 2), clip('kirke', 2), clip('kjenne', 2), clip('kino', 1)],
    });

    const set = await handler.execute(new GetSoundAtomDrillQuery('NB', []));

    expect(prisma.soundAtom.findMany.mock.calls[0][0].where).toEqual({
      language: 'nb',
      scored: true,
    });
    const asked = prisma.soundReferenceClip.findMany.mock.calls[0][0].where;
    expect([...asked.word.in].sort()).toEqual(['kirke', 'kjenne', 'kjøkkenet', 'kjøre', 'kino'].sort());
    expect(asked.assetId).toEqual({ not: null });

    expect(set.atoms[0].words.map((w) => w.word)).toEqual(['kjøre', 'kino', 'kirke']);
    expect(set.atoms[0].words[1].reference).toEqual({ assetId: 'asset-kino', tone: 1 });
    expect(set.atoms[0].phrases).toEqual([
      {
        text: 'Vi skal kjøre til kino.',
        carriers: [
          { word: 'kjøre', reference: { assetId: 'asset-kjøre', tone: 2 } },
          { word: 'kino', reference: { assetId: 'asset-kino', tone: 1 } },
        ],
        source: 'uttale-02-4:p2',
      },
      {
        text: 'Kom inn i kjøkkenet!',
        carriers: [{ word: 'kjøkkenet', reference: null }],
        source: 'uttale-05-5:p4',
      },
    ]);
    expect(set.diagnostic).toEqual([
      {
        atomId: 'nb:kj',
        word: { word: 'kjenne', reference: { assetId: 'asset-kjenne', tone: 2 } },
      },
    ]);
    expect(cache.set).toHaveBeenCalledWith('content:sound-atom-drill:nb', set, 600);
  });

  it('looks a capitalised carrier up in lower case', async () => {
    const row = {
      ...KJ,
      drill: { ...KJ.drill, phrases: [{ text: 'Kino nå.', carriers: ['Kino'], source: 'x:p1' }] },
    };
    const { handler } = makeHandler({ rows: [row], clips: [clip('kino', 1)] });

    const set = await handler.execute(new GetSoundAtomDrillQuery('nb', []));

    expect(set.atoms[0].phrases[0].carriers).toEqual([
      { word: 'Kino', reference: { assetId: 'asset-kino', tone: 1 } },
    ]);
  });

  it('keeps a pair only when both words have a clip; drops a diagnostic word without one', async () => {
    const { handler } = makeHandler({
      rows: [LENGTH],
      clips: [clip('tak'), clip('takk'), clip('fin')],
    });

    const set = await handler.execute(new GetSoundAtomDrillQuery('nb', []));

    expect(set.atoms[0].pairs.map(([a, b]) => [a.word, b.word])).toEqual([['tak', 'takk']]);
    expect(set.diagnostic.map((d) => d.word.word)).toEqual(['tak']);
  });

  it('slices the asked atoms but keeps the whole diagnostic list', async () => {
    const { handler } = makeHandler({
      rows: [KJ, LENGTH],
      clips: [clip('kjenne'), clip('tak')],
    });

    const set = await handler.execute(
      new GetSoundAtomDrillQuery('nb', ['nb:vowel_length', 'nb:nope']),
    );

    expect(set.atoms.map((a) => a.atomId)).toEqual(['nb:vowel_length']);
    expect(set.diagnostic.map((d) => d.atomId)).toEqual(['nb:kj', 'nb:vowel_length']);
  });

  it('serves the cache without reading the database', async () => {
    const cached = { language: 'nb', atoms: [], diagnostic: [] };
    const { handler, prisma } = makeHandler({ cached });

    expect(await handler.execute(new GetSoundAtomDrillQuery('nb', []))).toEqual(cached);
    expect(prisma.soundAtom.findMany).not.toHaveBeenCalled();
  });

  it('skips an atom without drill rows and asks no clips when there are no words', async () => {
    const { handler, prisma } = makeHandler({ rows: [{ id: 'nb:r', family: 'r', drill: null }] });

    const set = await handler.execute(new GetSoundAtomDrillQuery('nb', []));

    expect(set).toEqual({ language: 'nb', atoms: [], diagnostic: [] });
    expect(prisma.soundReferenceClip.findMany).not.toHaveBeenCalled();
  });
});
