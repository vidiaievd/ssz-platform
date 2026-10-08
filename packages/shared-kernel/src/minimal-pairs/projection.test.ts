// What leaves the server before and during a sitting — structurally, not by spot check
// (plan 72 §3.2, §3.6).

import { describe, expect, it } from 'vitest';

import { setFeedback } from './edits.js';
import { sampleDocument, SAMPLE_PAIR_IDS } from './fixture.js';
import { fromPersisted, isMinimalPairsDocument, toContent, toExpectedAnswers } from './persistence.js';
import { revealOf, toProbeView } from './probe.js';
import { toStudentProjection } from './projection.js';
import type { DealtProbe } from './sampler.js';

const P1 = SAMPLE_PAIR_IDS[0];
const probe: DealtProbe = { n: 3, pairId: P1, wordId: 'w2skja', side: 1, optionIds: ['w2skja', 'w1kjar'] };

describe('persistence', () => {
  it('round-trips the document', () => {
    const ex = sampleDocument();
    expect(fromPersisted(toContent(ex), toExpectedAnswers(ex))).toEqual(ex);
  });

  it('keeps the teacher note out of the content column', () => {
    const json = JSON.stringify(toContent(sampleDocument()));
    expect(json).not.toContain('Startparet');
    expect(toExpectedAnswers(sampleDocument()).pairs[P1]).toEqual({
      note: 'Startparet. Begge ordene er kjent fra leksjon 2.',
    });
  });

  it('reads garbage without throwing and fills defaults', () => {
    const ex = fromPersisted({ pairs: [{ words: [] }, 3], set: { probes: 999, playsPerProbe: 7 } }, null);
    expect(ex.pairs).toEqual([]);
    expect(ex.set.probes).toBe(30);
    expect(ex.set.playsPerProbe).toBe(2);
  });

  it('tells its documents apart', () => {
    expect(isMinimalPairsDocument(toContent(sampleDocument()))).toBe(true);
    expect(isMinimalPairsDocument({ questions: [] })).toBe(false);
  });
});

describe('the student projection', () => {
  const projection = toStudentProjection(toContent(sampleDocument()));

  it('carries no pair, no word, no clip, no note and no pass mark', () => {
    const json = JSON.stringify(projection);
    for (const leak of ['kjære', 'skjære', 'as_', 'pairs', 'Startparet', 'passPct', 'scoring', 'memory', 'w1kjar']) {
      expect(json).not.toContain(leak);
    }
  });

  it('carries what the runner and the reader card draw', () => {
    expect(projection).toEqual({
      title: 'Hører du kj eller sj?',
      instruction: 'Du hører ett ord. Trykk på ordet du hørte. Du kan lytte to ganger.',
      language: 'nb',
      contrast: { label: 'kj / sj', ipa: 'ç – ʃ' },
      set: { probes: 12, playsPerProbe: 2, autoplay: true },
      feedback: sampleDocument().feedback,
    });
  });
});

describe('a probe as handed out', () => {
  it('says which clip to play and never which word it is', () => {
    const view = toProbeView(sampleDocument(), probe, 12)!;
    expect(view.questionId).toBe('p3');
    expect(view.clip).toEqual({ assetId: 'as_skjære', durationMs: 820, provenance: 'studio', dialect: '' });
    expect(view.options.map((o) => o.id)).toEqual(['w2skja', 'w1kjar']);
    expect(JSON.stringify(view)).not.toContain('keyOptionId');
  });

  it('spells the buttons only when spelling is always shown; meaning only when always', () => {
    const spelled = toProbeView(sampleDocument(), probe, 12)!;
    expect(spelled.options[0]).toEqual({ id: 'w2skja', text: 'skjære' });
    const hidden = toProbeView(setFeedback(sampleDocument(), { showSpelling: 'afterAnswer', showIpa: true }), probe, 12)!;
    expect(hidden.options[0]).toEqual({ id: 'w2skja' });
    const glossed = toProbeView(setFeedback(sampleDocument(), { showGloss: 'always', showIpa: true }), probe, 12)!;
    expect(glossed.options[0]).toEqual({ id: 'w2skja', text: 'skjære', gloss: 'å skjære, med kniv', ipa: 'ˈʃæːɾə' });
  });
});

describe('a probe as revealed', () => {
  it('names the key, spells every button and compares on a miss', () => {
    const r = revealOf(sampleDocument(), probe, 'w1kjar');
    expect(r.keyOptionId).toBe('w2skja');
    expect(r.options).toEqual([
      { id: 'w2skja', text: 'skjære', gloss: 'å skjære, med kniv' },
      { id: 'w1kjar', text: 'kjære', gloss: 'kjær, om person' },
    ]);
    expect(r.compare).toEqual({ chosenAssetId: 'as_kjære', targetAssetId: 'as_skjære' });
  });

  it('does not compare on a hit, or with A/B off, and hides meaning set to never', () => {
    expect(revealOf(sampleDocument(), probe, 'w2skja').compare).toBeUndefined();
    const off = setFeedback(sampleDocument(), { abCompare: false, showGloss: 'never' });
    const r = revealOf(off, probe, 'w1kjar');
    expect(r.compare).toBeUndefined();
    expect(r.options[0]).toEqual({ id: 'w2skja', text: 'skjære' });
  });
});
