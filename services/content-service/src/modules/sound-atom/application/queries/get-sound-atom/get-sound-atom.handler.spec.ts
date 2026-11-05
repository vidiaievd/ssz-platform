import { GetSoundAtomHandler, normaliseLocale } from './get-sound-atom.handler.js';
import { GetSoundAtomQuery } from './get-sound-atom.query.js';
import { GetSoundAtomCatalogQuery } from '../../../../internal/application/queries/sound-atom-catalog/sound-atom-catalog.query.js';

// Plan 86, step 9.2: the learner's card of a sound is a slice of the cached catalogue.

const entry = (atomId: string) => ({
  atomId,
  family: atomId.split(':')[1],
  ipa: 'ç',
  scored: true,
  locale: 'uk',
  title: 'Звук kj',
  description: 'М’яке шипіння',
  howTo: null,
  commonError: null,
  ukNote: null,
  drill: null,
  carrierWords: ['kino'],
});

function makeHandler(atoms = [entry('nb:kj'), entry('nb:sj')]) {
  const asked: GetSoundAtomCatalogQuery[] = [];
  const queryBus = {
    execute: jest.fn((query: GetSoundAtomCatalogQuery) => {
      asked.push(query);
      return Promise.resolve({ language: query.language, locale: query.locale, atoms });
    }),
  };
  return { handler: new GetSoundAtomHandler(queryBus as any), asked };
}

describe('GetSoundAtomHandler', () => {
  it('reads the language’s catalogue in the locale and picks the atom', async () => {
    const { handler, asked } = makeHandler();
    await expect(handler.execute(new GetSoundAtomQuery('nb:sj', 'uk'))).resolves.toMatchObject({
      atomId: 'nb:sj',
    });
    expect(asked).toEqual([new GetSoundAtomCatalogQuery('nb', 'uk')]);
  });

  it('is null for an id the catalogue lacks, without asking for a malformed one', async () => {
    const { handler, asked } = makeHandler();
    await expect(handler.execute(new GetSoundAtomQuery('nb:zz', 'en'))).resolves.toBeNull();
    await expect(handler.execute(new GetSoundAtomQuery('kj', 'en'))).resolves.toBeNull();
    await expect(handler.execute(new GetSoundAtomQuery('nb:kj; drop', 'en'))).resolves.toBeNull();
    expect(asked).toHaveLength(1);
  });

  it('takes the id in any case and with spaces around', async () => {
    const { handler } = makeHandler();
    await expect(handler.execute(new GetSoundAtomQuery(' NB:KJ ', 'en'))).resolves.toMatchObject({
      atomId: 'nb:kj',
    });
  });

  it('cuts a locale to its primary subtag and turns garbage into English', () => {
    expect(normaliseLocale('nb-NO')).toBe('nb');
    expect(normaliseLocale('UK')).toBe('uk');
    expect(normaliseLocale('ru_RU')).toBe('ru');
    expect(normaliseLocale('')).toBe('en');
    expect(normaliseLocale(undefined)).toBe('en');
    expect(normaliseLocale('x'.repeat(40))).toBe('en');
    expect(normaliseLocale('../../etc')).toBe('en');
  });
});
