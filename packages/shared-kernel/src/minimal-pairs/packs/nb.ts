// Norwegian Bokmål — the five contrast families of the handoff (`MP_CONTRASTS`) and its pair
// library (`MP_LIBRARY`), as data of the `nb` pack.
//
// What the author reads about a family (its description and the note under the cards) is not
// here: it is an explanation in the language of the author's interface, translated four ways
// (plan 72 §3.3). What is here is what the student sees too — the label and the IPA — and what
// the code acts on: the synthesis policy and whether a clip needs a dialect.

import type { LanguagePack } from './types.js';

export const NB_PACK: LanguagePack = {
  language: 'nb',
  contrasts: [
    { id: 'kjsj', label: 'kj / sj', ipa: 'ç – ʃ', tts: 'no', icon: 'target', needsDialect: false },
    { id: 'length', label: 'Lengde', ipa: 'aː – a', tts: 'risky', icon: 'text', needsDialect: false },
    { id: 'vowel', label: 'Vokalkvalitet', ipa: 'a – ɔ – u – y', tts: 'ok', icon: 'sparkle', needsDialect: false },
    // Tonemes are inverted between Bergen and the East: without a dialect on every clip the set
    // is unteachable outside one region (DECISIONS §2).
    { id: 'tone', label: 'Tonem 1 / 2', ipa: '¹ – ²', tts: 'no', icon: 'wave', needsDialect: true },
    { id: 'consonant', label: 'Konsonant', ipa: 'p – r – l', tts: 'ok', icon: 'split', needsDialect: false },
  ],
  dialects: [
    { id: 'ost', label: 'Østlandsk', student: 'østlandsk' },
    { id: 'vest', label: 'Vestlandsk', student: 'vestlandsk' },
    { id: 'trond', label: 'Trøndersk', student: 'trøndersk' },
  ],
  // Words only. The phonology bank that would attach studio recordings does not exist yet
  // (plan 72 Q2-A), so every pair arrives without audio.
  //
  // `ånden / ånden` of the prototype is left out: a homograph pair is a real tonal minimal pair,
  // but two buttons with one spelling are unanswerable and the builder blocks them
  // (`MP_PAIR_DUPLICATE`) the moment they are inserted.
  library: {
    kjsj: [['kjære', 'skjære'], ['kjekk', 'sjekk'], ['kjenne', 'skjenne'], ['kjede', 'skjede'], ['kylling', 'skylling']],
    length: [['tak', 'takk'], ['hat', 'hatt'], ['lege', 'legge'], ['pen', 'penn'], ['mate', 'matte']],
    vowel: [['skal', 'skål'], ['har', 'hår'], ['male', 'måle'], ['lys', 'lus'], ['bry', 'bru']],
    tone: [['bønder', 'bønner']],
    consonant: [['kjøre', 'kjøpe'], ['vente', 'vinne'], ['fyr', 'fire']],
  },
  placeholders: {
    title: 'Hører du kj eller sj?',
    instruction: 'Du hører ett ord. Trykk på ordet du hørte.',
    words: ['kjære', 'skjære'],
    gloss: 'å skjære, med kniv',
    ipa: 'ˈʃæːɾə',
    note: 'Begge ordene er kjent fra leksjon 2.',
  },
};
