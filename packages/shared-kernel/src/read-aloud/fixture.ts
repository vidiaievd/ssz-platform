// The handoff's sample (`RA_SAMPLE`) as a fixture — shared by the kernel's tests, the engine's
// and the web's, so the three agree about one document. Ids are fixed; the texts are content of a
// Norwegian course, which is exactly why they live here and not in a default.

import type { ReadAloudContent } from './model.js';
import { DEFAULT_RECORDING, DEFAULT_REVIEW, DEFAULT_SETTINGS, defaultRubric } from './model.js';

export const SAMPLE_PROMPT_IDS = ['p1aaaa', 'p2bbbb'] as const;

export function sampleDocument(): ReadAloudContent {
  return {
    title: 'Les høyt — jobbsøknad',
    instruction: 'Les teksten høyt. Du kan ta opp inntil tre ganger og velge det beste opptaket.',
    language: 'nb',
    mode: 'read',
    prompts: [
      {
        id: SAMPLE_PROMPT_IDS[0],
        label: 'Avsnitt 1',
        text: 'Jeg søkte på jobben i går. Kontoret ligger i Kirkegata, og sjefen heter Kjetil. Han spurte om jeg kunne begynne allerede på mandag.',
        focus: [
          { id: 'f1', word: 'søkte', note: 'kj-lyd etter s: ikke «sj».' },
          { id: 'f2', word: 'Kjetil', note: 'kj-lyd i framlyd.' },
          { id: 'f3', word: 'Kirkegata', note: 'k foran i blir kj-lyd.' },
        ],
        image: { assetId: '', caption: '', alt: '' },
        plan: [],
        turn: { situation: '', partner: '' },
        note: 'Passasjen er lest i leksjon 3. Lytt etter kj/sj og etter trykk i «allerede».',
        minSeconds: 15,
        maxSeconds: 60,
        prepSeconds: 20,
      },
      {
        id: SAMPLE_PROMPT_IDS[1],
        label: 'Avsnitt 2',
        text: 'Bussen går hvert kvarter. Hvis du kommer for sent, må du vente i tjue minutter.',
        focus: [
          { id: 'f4', word: 'hvert', note: 'stum h.' },
          { id: 'f5', word: 'tjue', note: 'kj-lyd, ikke «tsju».' },
        ],
        image: { assetId: '', caption: '', alt: '' },
        plan: [],
        turn: { situation: '', partner: '' },
        note: 'Kort passasje: her teller flyt mer enn enkeltlyder.',
        minSeconds: 15,
        maxSeconds: 60,
        prepSeconds: 20,
      },
    ],
    rubric: defaultRubric('nb'),
    recording: { ...DEFAULT_RECORDING },
    settings: { ...DEFAULT_SETTINGS },
    review: { ...DEFAULT_REVIEW, ai: { ...DEFAULT_REVIEW.ai } },
  };
}
