// The `sound` atoms of each language (plan 86, step 8.1) — data of seed-sound-atoms.ts.
//
// `scored` families are exactly those ai-service may name (`soundAtomId` in its
// pronunciation module: every family with a threshold in `nb-sounds.data.ts`, plus `tone`
// from the toneme check). The rest are taught by the pronunciation course and never flagged.
// The articulation base (description, how-to, common error, drill, carrier words) is step 9.1.

export type SoundAtomLocale = 'en' | 'nb' | 'ru' | 'uk';

export interface SoundAtomSeed {
  language: string;
  family: string;
  ipa: string;
  scored: boolean;
  titles: Record<SoundAtomLocale, string>;
}

export const SOUND_ATOMS: readonly SoundAtomSeed[] = [
  {
    language: 'nb',
    family: 'kj',
    ipa: 'ç',
    scored: true,
    titles: { en: 'kj sound', nb: 'kj-lyden', ru: 'Звук kj', uk: 'Звук kj' },
  },
  {
    language: 'nb',
    family: 'sj',
    ipa: 'ʃ',
    scored: true,
    titles: { en: 'sj / skj sound', nb: 'sj-lyden', ru: 'Звук sj / skj', uk: 'Звук sj / skj' },
  },
  {
    language: 'nb',
    family: 'y',
    ipa: 'y ʏ',
    scored: true,
    titles: { en: 'Norwegian y', nb: 'y-lyden', ru: 'Норвежский y', uk: 'Норвезький y' },
  },
  {
    language: 'nb',
    family: 'uu',
    ipa: 'ʉ',
    scored: true,
    titles: { en: 'Norwegian u', nb: 'u-lyden', ru: 'Норвежский u', uk: 'Норвезький u' },
  },
  {
    language: 'nb',
    family: 'oe',
    ipa: 'ø œ',
    scored: true,
    titles: { en: 'ø sound', nb: 'ø-lyden', ru: 'Звук ø', uk: 'Звук ø' },
  },
  {
    language: 'nb',
    family: 'ae',
    ipa: 'æ',
    scored: true,
    titles: { en: 'æ sound', nb: 'æ-lyden', ru: 'Звук æ', uk: 'Звук æ' },
  },
  {
    language: 'nb',
    family: 'vowel_length',
    ipa: 'aː – a',
    scored: true,
    titles: {
      en: 'Long and short vowels',
      nb: 'Lange og korte vokaler',
      ru: 'Долгие и краткие гласные',
      uk: 'Довгі й короткі голосні',
    },
  },
  {
    language: 'nb',
    family: 'tone',
    ipa: '¹ – ²',
    scored: true,
    titles: { en: 'Tonemes 1 and 2', nb: 'Tonem 1 og 2', ru: 'Тонемы 1 и 2', uk: 'Тонеми 1 і 2' },
  },
  {
    language: 'nb',
    family: 'retroflex',
    ipa: 'ʈ ɖ ɳ ʂ ɭ',
    scored: false,
    titles: {
      en: 'Retroflex consonants (rs, rt, rn, rd, rl)',
      nb: 'Retroflekser (rs, rt, rn, rd, rl)',
      ru: 'Ретрофлексы (rs, rt, rn, rd, rl)',
      uk: 'Ретрофлекси (rs, rt, rn, rd, rl)',
    },
  },
  {
    language: 'nb',
    family: 'schwa',
    ipa: 'ə',
    scored: false,
    titles: { en: 'Unstressed e', nb: 'Trykklett e', ru: 'Безударный e', uk: 'Ненаголошений e' },
  },
  {
    language: 'nb',
    family: 'r',
    ipa: 'ɾ',
    scored: false,
    titles: { en: 'Norwegian r', nb: 'r-lyden', ru: 'Норвежский r', uk: 'Норвезький r' },
  },
];

/** `nb:kj` — the same spelling as ai-service's `soundAtomId`. */
export function soundAtomKey(language: string, family: string): string {
  return `${language}:${family}`;
}
