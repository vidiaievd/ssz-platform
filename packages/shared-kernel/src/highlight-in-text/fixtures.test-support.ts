// Test fixtures. Not part of the published surface — `tsconfig.json` excludes
// `*.test-support.ts` from the build.
//
// `SAMPLE_TEXT` is the handoff's passage (`HT_TEXT`): the acceptance criteria name its words
// (`reiste`, `gikk`, `var`, `Bodø,`), so tests that check those criteria read best on it.
// Spans are written as phrases and resolved here, the way the prototype's `htSpan` does, so
// no test carries hand-counted offsets.

import { toCharRange } from './coordinates.js';
import { runsOfWords } from './derive.js';
import type { HighlightInTextContent, Question, Settings, Span } from './model.js';
import { DEFAULT_SETTINGS } from './model.js';
import { tokenize, wordsOf } from './tokenize.js';

export const SAMPLE_TEXT =
  'I fjor sommer reiste vi til Lofoten. Vi tok toget til Bodø, og der gikk vi om bord i hurtigbåten. ' +
  'Været var fint hele uka, men den siste dagen regnet det kraftig.\n\n' +
  'Vi bodde i en liten rorbu ved sjøen, og hver morgen spiste vi frokost ute på brygga. ' +
  'Naboen vår fortalte at han hadde fisket i det samme vannet i førti år. ' +
  'Nå bor han i Bodø, men han kommer tilbake hver sommer.';

/** The span over the `nth` (1-based) occurrence of `phrase` in `text`. Throws when absent. */
export function spanAt(text: string, phrase: string, nth = 1, id = phrase, why = ''): Span {
  const tokens = tokenize(text);
  const run = runsOfWords(tokens, wordsOf(phrase))[nth - 1];
  if (!run) throw new Error(`fixture: "${phrase}" #${nth} is not in the text`);
  return { id, ...toCharRange(tokens, run), why };
}

export function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

export function question(id: string, overrides: Partial<Question> = {}): Question {
  return { id, prompt: `Prompt ${id}`, unit: 'word', spans: [], missHint: `${id} miss`, fpHint: `${id} fp`, ...overrides };
}

/** Preterite verbs — the handoff's first question. */
export const PRETERITE = ['reiste', 'tok', 'gikk', 'var', 'regnet', 'bodde', 'spiste', 'fortalte'];

/** Time expressions — the handoff's second question. */
export const TIME = ['I fjor sommer', 'hele uka', 'den siste dagen', 'hver morgen', 'i førti år', 'hver sommer'];

/**
 * A valid two-question exercise over the sample passage that raises no issue at all, so a
 * test can break exactly one thing. The spans are always laid over `SAMPLE_TEXT`; a test
 * that overrides `text` overrides `questions` too, or means the spans to be stale.
 */
export function exercise(overrides: Partial<HighlightInTextContent> = {}): HighlightInTextContent {
  const text = SAMPLE_TEXT;
  return {
    title: 'Preteritum i en feriefortelling',
    instruction: 'Les teksten og marker det oppgaven spør om.',
    text,
    questions: [
      question('q1', {
        prompt: 'Marker alle verbene som står i preteritum.',
        spans: PRETERITE.map((w) => spanAt(text, w, 1, w, `${w} — why`)),
      }),
      question('q2', {
        prompt: 'Marker tidsuttrykkene.',
        unit: 'phrase',
        spans: TIME.map((p) => spanAt(text, p, 1, p, `${p} — why`)),
      }),
    ],
    orphans: [],
    settings: settings(),
    ...overrides,
  };
}

/**
 * A passage of `n` distinct words (`w1 … wn`) and a question keyed on the first `keys` of
 * them — for the score arithmetic, where the words do not matter.
 */
export function counted(n: number, keys: number, overrides: Partial<Settings> = {}): HighlightInTextContent {
  const text = Array.from({ length: n }, (_, i) => `w${i + 1}`).join(' ') + '.';
  return {
    title: 'Counted',
    instruction: '',
    text,
    questions: [
      question('q', {
        spans: Array.from({ length: keys }, (_, i) => spanAt(text, `w${i + 1}`, 1, `k${i + 1}`)),
      }),
    ],
    orphans: [],
    settings: settings(overrides),
  };
}

/** The character range of the `nth` occurrence of `phrase` — a student's mark. */
export function markAt(text: string, phrase: string, nth = 1): { start: number; end: number } {
  const { start, end } = spanAt(text, phrase, nth);
  return { start, end };
}

/** Issue codes only — what most assertions care about. */
export function codes(issues: ReadonlyArray<{ code: string }>): string[] {
  return issues.map((i) => i.code);
}
