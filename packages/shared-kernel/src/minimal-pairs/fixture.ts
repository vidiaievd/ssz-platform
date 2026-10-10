// The handoff's sample (`MP_SAMPLE`) as a fixture — shared by the kernel's tests, the engine's and
// the web's, so the three agree about one document. Ids are fixed; the words are content of a
// Norwegian course, which is exactly why they live here and not in a default.

import type { Clip, MinimalPairsContent, Pair, Word } from './model.js';
import { DEFAULT_FEEDBACK, DEFAULT_SCORING, DEFAULT_SET } from './model.js';

export const SAMPLE_PAIR_IDS = ['pr1kjr', 'pr2kjk', 'pr3kjn', 'pr4kjo'] as const;

function clip(asset: string, durationMs: number): Clip {
  return {
    assetId: `as_${asset}`,
    fileName: `${asset}.mp3`,
    durationMs,
    provenance: 'studio',
    voice: 'Ingrid (Oslo)',
    dialect: '',
  };
}

function word(id: string, text: string, gloss: string, durationMs: number, ipa = '', asset = text): Word {
  return { id, text, gloss, ipa, clip: clip(asset, durationMs) };
}

export function sampleDocument(): MinimalPairsContent {
  const pairs: Pair[] = [
    {
      id: SAMPLE_PAIR_IDS[0],
      contrastId: '',
      note: 'Startparet. Begge ordene er kjent fra leksjon 2.',
      words: [
        word('w1kjar', 'kjære', 'kjær, om person', 780, 'ˈçæːɾə'),
        word('w2skja', 'skjære', 'å skjære, med kniv', 820, 'ˈʃæːɾə'),
      ],
    },
    {
      id: SAMPLE_PAIR_IDS[1],
      contrastId: '',
      note: '',
      words: [word('w3kjek', 'kjekk', 'hyggelig, grei', 640), word('w4sjek', 'sjekk', 'sjekk, kontroll', 660)],
    },
    {
      id: SAMPLE_PAIR_IDS[2],
      contrastId: '',
      note: '«Skjenne» er ukjent for de fleste — vises med oversettelse etter svaret.',
      words: [
        word('w5kjen', 'kjenne', 'å kjenne, vite om', 720),
        word('w6skje', 'skjenne', 'å skjenne, kjefte', 760),
      ],
    },
    {
      id: SAMPLE_PAIR_IDS[3],
      contrastId: 'consonant',
      note: '',
      words: [
        word('w7kjor', 'kjøre', 'å kjøre bil', 700),
        word('w8kjop', 'kjøpe', 'å kjøpe noe', 690),
        word('w9kjol', 'kjøle', 'å kjøle ned', 710, '', 'kjole'),
      ],
    },
  ];
  return {
    title: 'Hører du kj eller sj?',
    language: 'nb',
    contrastId: 'kjsj',
    instruction: 'Du hører ett ord. Trykk på ordet du hørte. Du kan lytte to ganger.',
    pairs,
    set: { ...DEFAULT_SET },
    feedback: { ...DEFAULT_FEEDBACK },
    scoring: { ...DEFAULT_SCORING },
  };
}
