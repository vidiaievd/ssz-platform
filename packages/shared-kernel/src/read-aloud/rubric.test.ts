// The verdict arithmetic, a prompt at a time (plan 70 §3.6, Q1-A).

import { describe, expect, it } from 'vitest';

import { sampleDocument, SAMPLE_PROMPT_IDS } from './fixture.js';
import {
  markKey,
  marksOf,
  parseMarkKey,
  readMarks,
  readSpeakingSnapshot,
  scorePrompts,
  simulatedMarks,
  snapshotOf,
} from './rubric.js';

const [P1, P2] = SAMPLE_PROMPT_IDS;
const IDS = [P1, P2];
const snapshot = snapshotOf(sampleDocument());

function marks(level1: [number, number, number], level2: [number, number, number]) {
  const out: Record<string, number> = {};
  ['pron', 'flow', 'content'].forEach((c, i) => {
    out[markKey(P1, c)] = level1[i]!;
    out[markKey(P2, c)] = level2[i]!;
  });
  return out;
}

describe('keys', () => {
  it('round-trips itemId:criterionId and refuses half a key', () => {
    expect(parseMarkKey(markKey('p1', 'pron'))).toEqual({ itemId: 'p1', criterionId: 'pron' });
    expect(parseMarkKey('p1')).toBeNull();
    expect(parseMarkKey(':pron')).toBeNull();
    expect(parseMarkKey('p1:')).toBeNull();
  });

  it('reads marks off a request: 0–3 under well-formed keys, nothing else', () => {
    expect(readMarks({ 'p1:pron': 2, 'p1:flow': 9, pron: 3, 'p1:content': 1.2 })).toEqual({
      'p1:pron': 2,
      'p1:content': 1,
    });
  });

  it('picks out one prompt', () => {
    expect(marksOf({ 'p1:pron': 2, 'p2:pron': 3 }, 'p1')).toEqual({ pron: 2 });
  });
});

describe('scorePrompts', () => {
  it('scores each prompt in rubric points and passes the submission only when every prompt passes', () => {
    // P1: 2×2 + 2×1 + 3×2 = 12; P2: 1×2 + 1×1 + 1×2 = 5. Threshold 9 per recording.
    const out = scorePrompts(snapshot, marks([2, 2, 3], [1, 1, 1]), IDS);
    expect(out.prompts.map((p) => [p.outcome.points, p.outcome.passed])).toEqual([
      [12, true],
      [5, false],
    ]);
    expect(out.points).toBe(17);
    expect(out.max).toBe(30);
    expect(out.percent).toBe(57);
    expect(out.passedCount).toBe(1);
    expect(out.passed).toBe(false);
    expect(out.complete).toBe(true);
  });

  it('passes when every prompt clears the threshold, compared in points', () => {
    const out = scorePrompts(snapshot, marks([2, 1, 2], [3, 3, 3]), IDS);
    expect(out.prompts[0]!.outcome.points).toBe(9);
    expect(out.passed).toBe(true);
  });

  it('names every missing mark by prompt and criterion', () => {
    const m = marks([2, 2, 2], [2, 2, 2]);
    delete m[markKey(P2, 'flow')];
    const out = scorePrompts(snapshot, m, IDS);
    expect(out.complete).toBe(false);
    expect(out.missing).toEqual([markKey(P2, 'flow')]);
  });

  it('ignores marks under a prompt the submission does not hold', () => {
    const out = scorePrompts(snapshot, { ...marks([3, 3, 3], [3, 3, 3]), 'ghost:pron': 0 }, IDS);
    expect(out.points).toBe(30);
  });

  it('is never complete with no prompts', () => {
    const out = scorePrompts(snapshot, {}, []);
    expect(out.complete).toBe(false);
    expect(out.passed).toBe(false);
  });
});

describe('the snapshot', () => {
  it('keeps who may see each criterion through a JSON column', () => {
    const doc = sampleDocument();
    doc.rubric[1] = { ...doc.rubric[1]!, studentVisible: false };
    const read = readSpeakingSnapshot(JSON.parse(JSON.stringify(snapshotOf(doc))));
    expect(read?.criteria.map((c) => c.studentVisible)).toEqual([true, false, true]);
    expect(read?.passScore).toBe(9);
    expect(read?.mode).toBe('read');
    expect(read?.criteria[0]!.levels[3]).toBe('Tydelig og trygg uttale; trykk og tonefall stemmer.');
  });

  it('reads a snapshot without a mode as one with no mode, not as a reading task', () => {
    const { mode: _mode, ...old } = snapshotOf(sampleDocument());
    expect(readSpeakingSnapshot(JSON.parse(JSON.stringify(old)))?.mode).toBeNull();
  });

  it('reads garbage as no rubric', () => {
    expect(readSpeakingSnapshot(null)).toBeNull();
    expect(readSpeakingSnapshot({ criteria: [] })).toBeNull();
  });
});

describe('the preview simulation', () => {
  it('marks every criterion of every prompt at one level', () => {
    const m = simulatedMarks(snapshot, IDS);
    expect(Object.keys(m)).toHaveLength(6);
    expect(scorePrompts(snapshot, m, IDS).points).toBe(20);
  });
});
