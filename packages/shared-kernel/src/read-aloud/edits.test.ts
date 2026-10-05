// The builder's mutations, the limits they hold and the submission they lead to (plan 70 §4.4).

import { describe, expect, it } from 'vitest';

import { passagePieces } from './derive.js';
import {
  addCriterion,
  addPrompt,
  isFocusWord,
  removePrompt,
  setMode,
  setPassScore,
  setPrompt,
  setRecording,
  setSeconds,
  toggleFocusWord,
} from './edits.js';
import { sampleDocument, SAMPLE_PROMPT_IDS } from './fixture.js';
import { formatSeconds, readSeconds, wordCount } from './limits.js';
import { defaultRubric, emptyContent, RA_MAX_PROMPTS } from './model.js';
import { initialState, reduce, type RecorderConfig, type RecorderEvent } from './recorder.js';
import { readDraft, readSubmission, toDraft, toSubmission, unsentAssets } from './submission.js';

const P1 = SAMPLE_PROMPT_IDS[0];

describe('mode', () => {
  it('resets the three numbers of every prompt and keeps the material', () => {
    const ex = setMode(sampleDocument(), 'monologue');
    expect(ex.prompts.map((p) => [p.minSeconds, p.maxSeconds, p.prepSeconds])).toEqual([
      [40, 120, 45],
      [40, 120, 45],
    ]);
    expect(ex.prompts[0]!.text).toContain('Jeg søkte');
    expect(setMode(ex, 'dialogue').prompts[0]!.maxSeconds).toBe(40);
  });
});

describe('limits', () => {
  it('holds 1–6 prompts and 2–5 criteria', () => {
    let ex = emptyContent('nb');
    expect(removePrompt(ex, ex.prompts[0]!.id).prompts).toHaveLength(1);
    for (let i = 0; i < 10; i++) ex = addPrompt(ex);
    expect(ex.prompts).toHaveLength(RA_MAX_PROMPTS);
    ex = addCriterion(addCriterion(addCriterion(ex)));
    expect(ex.rubric).toHaveLength(5);
  });

  it('keeps takes in 1–3, preparation in 0–120 and the pass mark at zero or above', () => {
    expect(setRecording(sampleDocument(), { takes: 7 }).recording.takes).toBe(3);
    expect(setRecording(sampleDocument(), { takes: 0 }).recording.takes).toBe(1);
    expect(setSeconds(sampleDocument(), P1, 'prepSeconds', 500).prompts[0]!.prepSeconds).toBe(120);
    expect(setSeconds(sampleDocument(), P1, 'maxSeconds', -4).prompts[0]!.maxSeconds).toBe(0);
    expect(setPassScore(sampleDocument(), -3).settings.passScore).toBe(0);
  });
});

describe('focus words', () => {
  it('toggles a word of the passage without case', () => {
    let ex = setPrompt(sampleDocument(), P1, { focus: [] });
    ex = toggleFocusWord(ex, P1, 'Kjetil');
    expect(isFocusWord(ex.prompts[0]!, 'kjetil')).toBe(true);
    ex = toggleFocusWord(ex, P1, 'KJETIL');
    expect(ex.prompts[0]!.focus).toEqual([]);
  });

  it('splits a passage into words and the punctuation between them', () => {
    const pieces = passagePieces('Hei, «Kjetil»!');
    expect(pieces.filter((p) => p.word).map((p) => p.word)).toEqual(['Hei', 'Kjetil']);
    expect(pieces.map((p) => p.text).join('')).toBe('Hei, «Kjetil»!');
  });
});

describe('estimates', () => {
  it('counts words and reading time the prototype way', () => {
    const text = sampleDocument().prompts[0]!.text;
    expect(wordCount(text)).toBe(23);
    expect(readSeconds(text)).toBe(13);
    expect(formatSeconds(75)).toBe('1:15');
    expect(formatSeconds(-2)).toBe('0:00');
  });
});

describe('the default rubric', () => {
  it('is the handoff working default in Norwegian, and empty wording elsewhere', () => {
    expect(defaultRubric('nb').map((c) => [c.name, c.weight])).toEqual([
      ['Uttale', 2],
      ['Flyt', 1],
      ['Innhold', 2],
    ]);
    expect(defaultRubric('uk').map((c) => [c.name, c.weight])).toEqual([
      ['', 2],
      ['', 1],
      ['', 2],
    ]);
  });
});

describe('draft and submission', () => {
  const cfg: RecorderConfig = {
    prompts: [{ id: 'p1', minSeconds: 1, maxSeconds: 30, prepSeconds: 0 }],
    recording: { ...sampleDocument().recording, micCheck: false, countdown: false },
  };
  const take = (n: number, assetId: string): RecorderEvent[] => [
    { type: 'begin' },
    { type: 'tick' },
    { type: 'tick' },
    { type: 'stop' },
    { type: 'stopped', ref: `blob:${n}` },
    { type: 'uploaded', itemId: 'p1', n, assetId },
  ];

  const events: RecorderEvent[] = [...take(1, 'a1'), ...take(2, 'a2'), { type: 'choose', index: 0 }];
  const state = events.reduce((s, e) => reduce(s, e, cfg), initialState(cfg));

  it('sends the chosen take and deletes the rest', () => {
    const submission = toSubmission(state, cfg)!;
    expect(submission).toEqual({ recordings: [{ itemId: 'p1', assetId: 'a1', seconds: 2, takes: 2 }] });
    expect(unsentAssets(state, submission)).toEqual(['a2']);
  });

  it('sends the discarded takes too under keepAllTakes', () => {
    const all = { ...cfg, recording: { ...cfg.recording, keepAllTakes: true } };
    const submission = toSubmission(state, all)!;
    expect(submission.recordings[0]!.discarded).toEqual([{ assetId: 'a2', seconds: 2 }]);
    expect(unsentAssets(state, submission)).toEqual([]);
  });

  it('round-trips the draft and refuses a malformed submission', () => {
    expect(readDraft(JSON.parse(JSON.stringify(toDraft(state))))).toEqual({
      takes: { p1: [{ n: 1, assetId: 'a1', seconds: 2 }, { n: 2, assetId: 'a2', seconds: 2 }] },
      chosen: { p1: 0 },
    });
    expect(readSubmission({ recordings: [{ itemId: 'p1', assetId: 'a1', seconds: 4, takes: 1 }] })).not.toBeNull();
    expect(readSubmission({ recordings: [{ itemId: 'p1', seconds: 4 }] })).toBeNull();
    expect(readSubmission({ text: 'x' })).toBeNull();
  });
});
