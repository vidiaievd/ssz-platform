// The sampler is the prototype's `mpSample`, lifted (plan 72 §4.1). The expected sequences below
// were produced by running `mp/data.jsx` of the handoff in node on `MP_SAMPLE` — the fixture is
// the same document, so the same seed must draw the same words on the same sides.

import { describe, expect, it } from 'vitest';

import { filledWords } from './derive.js';
import { setSet } from './edits.js';
import { sampleDocument } from './fixture.js';
import type { MinimalPairsContent } from './model.js';
import { checkDraw, deal, lcg, readDraw, sample } from './sampler.js';

function textOf(ex: MinimalPairsContent, wordId: string): string {
  return ex.pairs.flatMap((p) => p.words).find((w) => w.id === wordId)?.text ?? '?';
}

function draw(ex: MinimalPairsContent, seed: number): string {
  return sample(ex, lcg(seed))
    .map((p) => `${textOf(ex, p.wordId)}:${p.side}`)
    .join(' ');
}

describe('against the prototype', () => {
  it.each([
    [7, 'kjøle:2 kjøre:0 skjære:1 sjekk:1 kjære:0 skjenne:1 kjenne:0 kjøpe:1 kjekk:0 kjøle:2 skjenne:1 skjære:1'],
    [11, 'kjøre:0 skjære:1 skjenne:1 kjenne:0 sjekk:1 kjære:0 kjøpe:1 kjøle:2 kjekk:0 kjøle:2 kjekk:0 sjekk:1'],
    [8, 'kjøpe:1 skjære:1 kjenne:0 kjøre:0 sjekk:1 skjenne:1 kjøle:2 kjære:0 kjekk:0 sjekk:1 kjøpe:1 kjenne:0'],
  ])('balanced, seed %i', (seed, expected) => {
    expect(draw(sampleDocument(), seed)).toBe(expected);
  });

  it.each([
    [7, 'kjøle:2 kjekk:0 kjøpe:1 kjære:0 sjekk:1 skjenne:1 skjære:1 kjenne:0 kjøre:0 kjære:0 skjære:1 sjekk:1'],
    [11, 'kjøre:0 skjenne:1 kjøle:2 kjenne:0 sjekk:1 kjære:0 kjøpe:1 kjekk:0 skjære:1 kjøre:0 kjære:0 skjære:1'],
  ])('random, seed %i', (seed, expected) => {
    expect(draw(setSet(sampleDocument(), { sampling: 'random' }), seed)).toBe(expected);
  });

  it('without repeats stops at one probe per word', () => {
    const ex = setSet(sampleDocument(), { allowRepeat: false, probes: 15 });
    expect(draw(ex, 7)).toBe('kjøle:2 kjøre:0 skjære:1 sjekk:1 kjære:0 skjenne:1 kjenne:0 kjøpe:1 kjekk:0');
  });
});

describe('balanced', () => {
  it('meets every word once before any word repeats', () => {
    for (let seed = 1; seed < 40; seed++) {
      const ex = sampleDocument();
      const first = sample(ex, lcg(seed)).slice(0, 9).map((p) => p.wordId);
      expect(new Set(first).size).toBe(9);
    }
  });

  it('breaks runs of one side that random drawing leaves in', () => {
    // Three identical sides in a row are possible only when the rest of the deck is all one side;
    // without the guard they are ordinary.
    const triples = (sampling: 'balanced' | 'random') => {
      const ex = setSet(sampleDocument(), { probes: 30, sampling });
      let n = 0;
      for (let seed = 1; seed < 80; seed++) {
        const out = sample(ex, lcg(seed));
        for (let i = 2; i < out.length; i++) {
          if (out[i]!.side === out[i - 1]!.side && out[i]!.side === out[i - 2]!.side) n++;
        }
      }
      return n;
    };
    expect(triples('balanced')).toBeLessThan(triples('random') / 4);
  });

  it('numbers probes from one', () => {
    expect(sample(sampleDocument(), lcg(3)).map((p) => p.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('draws nothing when no pair is ready', () => {
    const ex = sampleDocument();
    ex.pairs = ex.pairs.map((p) => ({ ...p, words: p.words.map((w) => ({ ...w, clip: { ...w.clip, assetId: '' } })) }));
    expect(sample(ex, lcg(7))).toEqual([]);
  });
});

describe('weakest', () => {
  it('is balanced exactly when there is no history', () => {
    const balanced = draw(sampleDocument(), 7);
    const weakest = setSet(sampleDocument(), { sampling: 'weakest' });
    expect(draw(weakest, 7)).toBe(balanced);
    expect(sample(weakest, lcg(7), {}).map((p) => p.wordId)).toEqual(
      sample(sampleDocument(), lcg(7)).map((p) => p.wordId),
    );
  });

  it('brings a missed word back more often', () => {
    const ex = setSet(sampleDocument(), { sampling: 'weakest', probes: 30 });
    let missed = 0;
    let plain = 0;
    for (let seed = 1; seed < 40; seed++) {
      const out = sample(ex, lcg(seed), { skjære: { played: 3, missed: 2 } });
      missed += out.filter((p) => textOf(ex, p.wordId) === 'skjære').length;
      plain += out.filter((p) => textOf(ex, p.wordId) === 'kjekk').length;
    }
    expect(missed).toBeGreaterThan(plain * 1.5);
  });
});

describe('deal', () => {
  it('gives every probe the buttons of its pair, shuffled', () => {
    const ex = sampleDocument();
    for (const p of deal(ex, lcg(5))) {
      const pair = ex.pairs.find((x) => x.id === p.pairId)!;
      expect([...p.optionIds].sort()).toEqual(filledWords(pair).map((w) => w.id).sort());
      expect(p.optionIds).toContain(p.wordId);
    }
  });

  it('keeps A left and B right with shuffling off', () => {
    const ex = setSet(sampleDocument(), { shuffleOptions: false });
    for (const p of deal(ex, lcg(5))) {
      const pair = ex.pairs.find((x) => x.id === p.pairId)!;
      expect(p.optionIds).toEqual(filledWords(pair).map((w) => w.id));
    }
  });

  it('offers every word of the set with «all words»', () => {
    const ex = setSet(sampleDocument(), { options: 'all' });
    expect(deal(ex, lcg(5))[0]!.optionIds).toHaveLength(9);
  });
});

describe('readDraw', () => {
  it('reads back what deal wrote and drops what it did not', () => {
    const dealt = deal(sampleDocument(), lcg(7));
    expect(readDraw(JSON.parse(JSON.stringify(dealt)))).toEqual(dealt);
    expect(readDraw(null)).toEqual([]);
    expect(readDraw([{ n: 1 }, 'x', { n: 2, pairId: 'p', wordId: 'w', optionIds: ['w', 3] }])).toEqual([
      { n: 2, pairId: 'p', wordId: 'w', side: 0, optionIds: ['w'] },
    ]);
  });
});

describe('checkDraw', () => {
  const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

  it('takes any draw deal could have made, from every sampling and option mode', () => {
    for (const set of [{}, { sampling: 'random' as const }, { options: 'all' as const }, { shuffleOptions: false }]) {
      const ex = setSet(sampleDocument(), set);
      for (let seed = 1; seed < 20; seed++) {
        const dealt = deal(ex, lcg(seed));
        expect(checkDraw(ex, plain(dealt))).toEqual({ draw: dealt });
      }
    }
  });

  it('refuses nothing, a non-array and more probes than the set has', () => {
    const ex = sampleDocument();
    expect(checkDraw(ex, [])).toEqual({ fault: 'empty' });
    expect(checkDraw(ex, null)).toEqual({ fault: 'empty' });
    const long = deal(setSet(ex, { probes: 20 }), lcg(3));
    expect(checkDraw(ex, plain(long))).toEqual({ fault: 'tooMany' });
  });

  it('refuses a probe readDraw would have dropped', () => {
    const dealt = plain(deal(sampleDocument(), lcg(7)));
    expect(checkDraw(sampleDocument(), [...dealt.slice(0, 2), { n: 3 }])).toEqual({ fault: 'malformed' });
  });

  it('refuses probes out of order', () => {
    const dealt = plain(deal(sampleDocument(), lcg(7)));
    [dealt[0]!.n, dealt[1]!.n] = [2, 1];
    expect(checkDraw(sampleDocument(), dealt)).toEqual({ fault: 'outOfOrder' });
  });

  it('refuses a pair, a word or a side the document does not have', () => {
    const ex = sampleDocument();
    const at = (patch: Record<string, unknown>) => {
      const dealt = plain(deal(ex, lcg(7)));
      Object.assign(dealt[0]!, patch);
      return checkDraw(ex, dealt);
    };
    expect(at({ pairId: 'nope' })).toEqual({ fault: 'unknownPair' });
    expect(at({ wordId: 'nope' })).toEqual({ fault: 'unknownWord' });
    const first = deal(ex, lcg(7))[0]!;
    expect(at({ side: first.side + 1 })).toEqual({ fault: 'wrongSide' });
  });

  it('refuses buttons that are not exactly the pair’s', () => {
    const ex = sampleDocument();
    const at = (optionIds: (ids: string[]) => string[]) => {
      const dealt = plain(deal(ex, lcg(7)));
      dealt[0]!.optionIds = optionIds(dealt[0]!.optionIds);
      return checkDraw(ex, dealt);
    };
    expect(at((ids) => ids.slice(1))).toEqual({ fault: 'wrongOptions' });
    expect(at((ids) => [...ids.slice(1), ids[1]!])).toEqual({ fault: 'wrongOptions' });
    expect(at((ids) => [...ids.slice(1), 'stranger'])).toEqual({ fault: 'wrongOptions' });
  });

  it('refuses a probe from a pair that has lost a clip since', () => {
    const ex = sampleDocument();
    const dealt = plain(deal(ex, lcg(7)));
    const pair = ex.pairs.find((p) => p.id === dealt[0]!.pairId)!;
    pair.words[0]!.clip = { ...pair.words[0]!.clip, assetId: '' };
    expect(checkDraw(ex, dealt)).toEqual({ fault: 'unknownPair' });
  });
});
