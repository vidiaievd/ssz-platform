jest.mock('../../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { GetSoundAtomCatalogHandler } from './sound-atom-catalog.handler.js';
import { GetSoundAtomCatalogQuery } from './sound-atom-catalog.query.js';

// Plan 86, step 8.1: the sound atoms of a language, texts in one locale.

const text = (locale: string, title: string, extra: Record<string, string | null> = {}) => ({
  locale,
  title,
  description: null,
  howTo: null,
  commonError: null,
  ukNote: null,
  drill: null,
  ...extra,
});

const atom = (id: string, family: string, texts: unknown[], scored = true) => ({
  id,
  family,
  ipa: 'ç',
  scored,
  carrierWords: ['kjøkken'],
  texts,
});

function makeHandler(options: { rows?: unknown[]; cached?: unknown } = {}) {
  const prisma = { soundAtom: { findMany: jest.fn().mockResolvedValue(options.rows ?? []) } };
  const cache = {
    get: jest.fn().mockResolvedValue(options.cached ?? null),
    set: jest.fn().mockResolvedValue(undefined),
  };
  const handler = new GetSoundAtomCatalogHandler(prisma as any, cache as any);
  return { handler, prisma, cache };
}

describe('GetSoundAtomCatalogHandler', () => {
  it('lists the atoms of the language in course order, texts in the asked locale', async () => {
    const { handler, prisma, cache } = makeHandler({
      rows: [
        atom('nb:kj', 'kj', [
          text('en', 'kj sound'),
          text('ru', 'Звук kj', { commonError: 'х вместо ç' }),
        ]),
      ],
    });

    const catalog = await handler.execute(new GetSoundAtomCatalogQuery('NB', 'ru'));

    const args = prisma.soundAtom.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ language: 'nb' });
    expect(args.orderBy).toEqual({ position: 'asc' });
    expect(args.include.texts.where.locale.in).toEqual(['ru', 'en']);
    expect(catalog).toEqual({
      language: 'nb',
      locale: 'ru',
      atoms: [
        {
          atomId: 'nb:kj',
          family: 'kj',
          ipa: 'ç',
          scored: true,
          locale: 'ru',
          title: 'Звук kj',
          description: null,
          howTo: null,
          commonError: 'х вместо ç',
          ukNote: null,
          drill: null,
          carrierWords: ['kjøkken'],
        },
      ],
    });
    expect(cache.set).toHaveBeenCalledWith('content:sound-atom-catalog:nb:ru', catalog, 600);
  });

  it('falls back to English where the locale has no text, and says so', async () => {
    const { handler } = makeHandler({
      rows: [atom('nb:r', 'r', [text('en', 'Norwegian r')], false)],
    });

    const catalog = await handler.execute(new GetSoundAtomCatalogQuery('nb', 'uk'));

    expect(catalog.atoms[0]).toMatchObject({
      atomId: 'nb:r',
      locale: 'en',
      title: 'Norwegian r',
      scored: false,
    });
  });

  it('leaves out an atom with no text in either locale', async () => {
    const { handler } = makeHandler({ rows: [atom('nb:kj', 'kj', [])] });

    expect((await handler.execute(new GetSoundAtomCatalogQuery('nb', 'ru'))).atoms).toEqual([]);
  });

  it('answers from the cache without a read', async () => {
    const cached = { language: 'nb', locale: 'en', atoms: [] };
    const { handler, prisma } = makeHandler({ cached });

    expect(await handler.execute(new GetSoundAtomCatalogQuery('nb', 'en'))).toBe(cached);
    expect(prisma.soundAtom.findMany).not.toHaveBeenCalled();
  });
});
