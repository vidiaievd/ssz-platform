import type {
  DrillMaterial,
  MaterialWord,
  SoundMaterial,
} from '../../../src/modules/sound-sessions/domain/session-plan.js';

export const w = (word: string, tone: 1 | 2 | null = null): MaterialWord => ({
  word,
  assetId: `asset-${word}`,
  tone,
});

/** A draw that always answers 0: picks take the first item, a shuffle is fixed. */
export const first = (): number => 0;

export const kj: SoundMaterial = {
  atomId: 'nb:kj',
  family: 'kj',
  words: [w('kjenne'), w('kino'), w('kjøpe')],
  pairs: [],
  phrases: [{ text: 'Jeg kjenner ham.', carriers: [{ word: 'kjenner', assetId: null }], source: 'uttale-06:p1' }],
};

export const sj: SoundMaterial = {
  atomId: 'nb:sj',
  family: 'sj',
  words: [w('skjorte'), w('sju')],
  pairs: [],
  phrases: [],
};

export const length: SoundMaterial = {
  atomId: 'nb:vowel_length',
  family: 'vowel_length',
  words: [w('tak')],
  pairs: [[w('tak'), w('takk')]],
  phrases: [],
};

export const tone: SoundMaterial = {
  atomId: 'nb:tone',
  family: 'tone',
  words: [w('jente', 2)],
  pairs: [[w('fisken', 1), w('fiske', 2)]],
  phrases: [],
};

export const y: SoundMaterial = {
  atomId: 'nb:y',
  family: 'y',
  words: [w('lys')],
  pairs: [],
  phrases: [],
};

export function material(atoms: SoundMaterial[] = [kj, sj, length, tone, y]): DrillMaterial {
  return {
    language: 'nb',
    atoms,
    diagnostic: atoms.map((a) => ({ atomId: a.atomId, word: a.words[0]! })),
  };
}

export const noRecord = { cards: [], flags: [] };
