// Judging and summing up (plan 72 §3.6–3.7): the first answer counts, a second chance closes a
// probe and never makes the score, an unanswered probe is wrong.

import { describe, expect, it } from 'vitest';

import { setFeedback } from './edits.js';
import { sampleDocument, SAMPLE_PAIR_IDS } from './fixture.js';
import type { ProbeState } from './judge.js';
import { historyFrom, judgePick, maxTries, probeRecords, readProbeRecords, summarize } from './judge.js';
import type { DealtProbe } from './sampler.js';

const P1 = SAMPLE_PAIR_IDS[0];
const probe = (n: number, wordId: string, other: string): DealtProbe => ({
  n,
  pairId: P1,
  wordId,
  side: 0,
  optionIds: [wordId, other],
});

describe('maxTries', () => {
  it('is two with a second chance, one without, and one in an assignment', () => {
    const ex = sampleDocument();
    expect(maxTries(ex.feedback, false)).toBe(1);
    const second = setFeedback(ex, { secondChance: true });
    expect(maxTries(second.feedback, false)).toBe(2);
    expect(maxTries(second.feedback, true)).toBe(1);
  });
});

describe('judgePick', () => {
  const p = probe(1, 'w1kjar', 'w2skja');

  it('closes on a right answer', () => {
    const r = judgePick(p, undefined, 'w1kjar', 2);
    expect(r).toEqual({ verdict: { correct: true, closed: true, first: true }, next: { n: 1, picks: ['w1kjar'], closed: true } });
  });

  it('keeps the probe open after a miss when a try is left', () => {
    const r = judgePick(p, undefined, 'w2skja', 2);
    expect('verdict' in r && r.verdict).toEqual({ correct: false, closed: false, first: true });
  });

  it('closes after the last try, right or not', () => {
    const open: ProbeState = { n: 1, picks: ['w2skja'], closed: false };
    const r = judgePick(p, open, 'w1kjar', 2);
    expect('verdict' in r && r.verdict).toEqual({ correct: true, closed: true, first: false });
  });

  it('refuses a closed probe and a button that is not on it', () => {
    expect(judgePick(p, { n: 1, picks: ['w1kjar'], closed: true }, 'w1kjar', 2)).toEqual({ refused: 'closed' });
    expect(judgePick(p, undefined, 'w5kjen', 2)).toEqual({ refused: 'not_an_option' });
  });
});

describe('summarize', () => {
  const ex = sampleDocument();
  const draw = [probe(1, 'w1kjar', 'w2skja'), probe(2, 'w2skja', 'w1kjar'), probe(3, 'w1kjar', 'w2skja'), probe(4, 'w2skja', 'w1kjar')];

  it('scores first answers only, and counts an unanswered probe as wrong', () => {
    const states: ProbeState[] = [
      { n: 1, picks: ['w1kjar'], closed: true },
      { n: 2, picks: ['w1kjar', 'w2skja'], closed: true }, // right on the second try: not counted
      { n: 3, picks: ['w1kjar'], closed: true },
    ];
    const s = summarize(ex, draw, states);
    expect(s).toMatchObject({ right: 2, total: 4, score: 50, passed: false, passPct: 75, memory: 'contrast' });
    expect(s.pairs).toEqual([{ pairId: P1, words: ['kjære', 'skjære'], played: 4, correct: 2 }]);
  });

  it('passes at the mark exactly', () => {
    const states = draw.slice(0, 3).map((p) => ({ n: p.n, picks: [p.wordId], closed: true }));
    expect(summarize(ex, draw, states).passed).toBe(true); // 75 >= 75
  });

  it("carries the author's memory policy for the closing line", () => {
    const none = { ...ex, scoring: { ...ex.scoring, memory: 'none' as const } };
    expect(summarize(none, draw, []).memory).toBe('none');
  });
});

describe('records and history', () => {
  it('keeps the first and the last answer, the provenance and the contrast, and reads back', () => {
    const ex = sampleDocument();
    const draw = [probe(1, 'w1kjar', 'w2skja')];
    const records = probeRecords(ex, draw, [{ n: 1, picks: ['w2skja', 'w1kjar'], closed: true }]);
    expect(records[0]).toEqual({
      n: 1,
      pairId: P1,
      wordId: 'w1kjar',
      text: 'kjære',
      contrastId: 'kjsj',
      first: 'w2skja',
      final: 'w1kjar',
      tries: 2,
      correct: false,
      provenance: 'studio',
    });
    expect(readProbeRecords(JSON.parse(JSON.stringify(records)))).toEqual(records);
    expect(readProbeRecords([{ junk: true }, 'x'])).toEqual([]);
  });

  it('builds a history of one contrast by spelling', () => {
    const ex = sampleDocument();
    const records = probeRecords(
      ex,
      [probe(1, 'w1kjar', 'w2skja'), probe(2, 'w1kjar', 'w2skja')],
      [
        { n: 1, picks: ['w2skja'], closed: true },
        { n: 2, picks: ['w1kjar'], closed: true },
      ],
    );
    expect(historyFrom(records, 'kjsj')).toEqual({ kjære: { played: 2, missed: 1 } });
    expect(historyFrom(records, 'tone')).toEqual({});
  });
});
