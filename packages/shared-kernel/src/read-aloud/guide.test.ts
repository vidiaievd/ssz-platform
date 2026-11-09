// Plan 86, step 6h.1 — the pronunciation guide of a `read` exercise: switches, blockers, rail.

import { describe, expect, it } from 'vitest';

import { emptyProsodyLayer, type ProsodyLayer } from '../prosody/model.js';
import { parseProsodyNotation } from '../prosody/notation.js';
import { setGuide, setMode, setPrompt, toggleLens } from './edits.js';
import { sampleDocument, SAMPLE_PROMPT_IDS } from './fixture.js';
import { guideIssues, type GuidePrompt } from './guide.js';
import { issues, isReady, railSteps } from './issues.js';
import type { ReadAloudContent } from './model.js';
import { fromPersisted, readContent, toContent, toExpectedAnswers } from './persistence.js';
import { toStudentProjection } from './projection.js';

const [P1, P2] = SAMPLE_PROMPT_IDS;
const TEXT = 'Bartek bor i Oslo. Han liker jobben.';

/** One prompt with a short passage, the second one empty, the guide on. */
function guided(): ReadAloudContent {
  let ex = setPrompt(sampleDocument(), P1, { text: TEXT });
  ex = setPrompt(ex, P2, { text: '' });
  return setGuide(ex, { enabled: true });
}

const given = (layer: ProsodyLayer, unresolved: GuidePrompt['unresolved'] = []) => ({
  [P1]: { layer, unresolved },
});

const codes = (ex: ReadAloudContent, guide: Record<string, GuidePrompt>) =>
  guideIssues(ex, guide).map((i) => i.code);

describe('the switches', () => {
  it('are off on a new document and on one written before them', () => {
    expect(sampleDocument().pronunciationGuide.enabled).toBe(false);
    const old = readContent({ mode: 'read', prompts: [] });
    expect(old.pronunciationGuide).toEqual({
      enabled: false,
      sentenceDrill: true,
      lenses: ['stress', 'sounds', 'respell'],
    });
  });

  it('survive a round trip, lenses deduplicated in the switch order; an empty list stays empty', () => {
    const ex = toggleLens(guided(), 'melody');
    const back = fromPersisted(JSON.parse(JSON.stringify(toContent(ex))), toExpectedAnswers(ex));
    expect(back.pronunciationGuide).toEqual({
      enabled: true,
      sentenceDrill: true,
      lenses: ['stress', 'sounds', 'respell', 'melody'],
    });
    const messy = readContent({
      pronunciationGuide: { lenses: ['melody', 'nope', 'stress', 'melody'] },
    });
    expect(messy.pronunciationGuide.lenses).toEqual(['stress', 'melody']);
    expect(readContent({ pronunciationGuide: { lenses: [] } }).pronunciationGuide.lenses).toEqual(
      [],
    );
  });

  it('reach the learner only when on for `read`', () => {
    const project = (ex: ReadAloudContent) =>
      toStudentProjection(toContent(ex), toExpectedAnswers(ex));
    expect(project(sampleDocument()).pronunciationGuide).toBeUndefined();
    expect(project(guided()).pronunciationGuide).toEqual({
      sentenceDrill: true,
      lenses: ['stress', 'sounds', 'respell'],
    });
    expect(project(setMode(guided(), 'monologue')).pronunciationGuide).toBeUndefined();
  });
});

describe('the rail', () => {
  it('draws step 6 second, only when the guide is on for `read`', () => {
    expect(railSteps(sampleDocument())).toEqual([1, 2, 3, 4, 5]);
    expect(railSteps(guided())).toEqual([1, 6, 2, 3, 4, 5]);
    expect(railSteps(setMode(guided(), 'dialogue'))).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('guideIssues', () => {
  it('asks nothing of a guide that is off, or of a prompt nobody read', () => {
    const ex = setPrompt(sampleDocument(), P1, { text: TEXT });
    expect(codes(ex, given(emptyProsodyLayer(), [{ i: 0, w: 'Bartek' }]))).toEqual([]);
    expect(codes(guided(), {})).toEqual([]);
  });

  it('blocks a guide with every lens taken away, in the document check too', () => {
    let ex = guided();
    for (const lens of ex.pronunciationGuide.lenses) ex = toggleLens(ex, lens);
    expect(codes(ex, {})).toEqual(['RA_GUIDE_NO_LENS']);
    expect(isReady(ex, { audio: true })).toBe(false);
  });

  it('blocks a word the lexicon left bare until the author answers it', () => {
    const unresolved = [{ i: 0, w: 'Bartek' }];
    expect(guideIssues(guided(), given(emptyProsodyLayer(), unresolved))).toEqual([
      {
        code: 'RA_GUIDE_WORD_UNCONFIRMED',
        level: 'blocker',
        step: 6,
        promptId: P1,
        i: 0,
        w: 'Bartek',
      },
    ]);
    expect(
      codes(
        guided(),
        given(parseProsodyNotation("'0Bartek bor i Oslo. Han liker jobben.").layer, unresolved),
      ),
    ).toEqual([]);
    expect(
      codes(
        guided(),
        given(parseProsodyNotation("'1Bartek bor i Oslo. Han liker jobben.").layer, unresolved),
      ),
    ).toEqual([]);
  });

  it('with the melody lens, wants a pitched group end on the last word of every sentence', () => {
    const ex = toggleLens(guided(), 'melody');
    const half = parseProsodyNotation('Bartek bor i Oslo. \\ | Han liker jobben. |').layer;
    expect(guideIssues(ex, given(half))).toEqual([
      {
        code: 'RA_GUIDE_SENTENCE_NO_END',
        level: 'blocker',
        step: 6,
        promptId: P1,
        sentence: 1,
        i: 6,
      },
    ]);
    const full = parseProsodyNotation('Bartek bor i Oslo. \\ | Han liker jobben. \\ ||').layer;
    expect(codes(ex, given(full))).toEqual([]);
    expect(codes(guided(), given(half))).toEqual([]);
  });

  it('blocks a layer off its text without listing its words, and warns about orphans', () => {
    const stale = parseProsodyNotation("'0Anna bor i Oslo. Han liker jobben.").layer;
    expect(codes(guided(), given(stale, [{ i: 0, w: 'Bartek' }]))).toEqual([
      'RA_GUIDE_LAYER_INVALID',
    ]);
    const orphaned: ProsodyLayer = {
      ...emptyProsodyLayer(),
      orphans: [{ kind: 'accent', mark: { i: 9, w: 'gone', source: 'teacher' } }],
    };
    expect(codes(guided(), given(orphaned))).toEqual(['RA_GUIDE_ORPHANS']);
  });

  it('reach the document check through the context, on step 6', () => {
    const all = issues(guided(), {
      audio: true,
      guide: given(emptyProsodyLayer(), [{ i: 0, w: 'Bartek' }]),
    });
    const own = all.filter((i) => i.step === 6);
    expect(own.map((i) => i.code)).toEqual(['RA_GUIDE_WORD_UNCONFIRMED']);
  });
});
