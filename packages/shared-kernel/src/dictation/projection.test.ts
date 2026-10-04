// SPEC_api_contract §2, AC-R3, AC-X2 — and the round trip through both columns.

import { describe, expect, it } from 'vitest';

import { sample } from './fixtures.test-support.js';
import { fromPersisted, toContent, toExpectedAnswers } from './persistence.js';
import { toStudentProjection, withGradedSettings } from './projection.js';

describe('persistence', () => {
  it('round-trips a document through the two columns', () => {
    const ex = sample();
    expect(fromPersisted(toContent(ex), toExpectedAnswers(ex))).toEqual(ex);
  });

  it('content holds no sentence, reason, focus word or transcript', () => {
    const ex = sample();
    const withTranscript = { ...ex, audio: { ...ex.audio, transcript: ex.segments[0]!.text } };
    const content = JSON.stringify(toContent(withTranscript));
    for (const s of ex.segments) expect(content).not.toContain(s.text);
    expect(content).not.toContain('kj- foran ø.');
    expect(content).not.toContain('A rule the ear missed.');
  });

  it('forces the audio on and reads a document without one as the type’s defaults', () => {
    const ex = sample();
    expect(toContent({ ...ex, audio: { ...ex.audio, enabled: false } }).audio.enabled).toBe(true);
    expect(fromPersisted({}, {}).audio).toMatchObject({
      enabled: true,
      settings: { plays: 3, transcriptWhen: 'after' },
    });
  });
});

describe('toStudentProjection', () => {
  it('AC-X2: structurally — ids only, no key, no rules', () => {
    const ex = sample();
    const p = toStudentProjection(toContent(ex), toExpectedAnswers(ex));
    expect(Object.keys(p).sort()).toEqual(['instruction', 'mode', 'segments', 'settings']);
    expect(p.segments).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(Object.keys(p.settings).sort()).toEqual([
      'attempts',
      'hints',
      'revealKey',
      'showWordCount',
    ]);
    const json = JSON.stringify(p);
    for (const s of ex.segments) expect(json).not.toContain(s.text);
    expect(json).not.toMatch(/threshold|marking|language|focus|why|orphans/);
  });

  it('AC-R3: the word count only under showWordCount', () => {
    const ex = sample();
    const on = { ...ex, settings: { ...ex.settings, showWordCount: true } };
    expect(toStudentProjection(toContent(on), toExpectedAnswers(on)).segments).toEqual([
      { id: 'a', wordCount: 6 },
      { id: 'b', wordCount: 7 },
    ]);
  });

  it('drops unfinished segments; no key column, no segments', () => {
    const ex = sample();
    const draft = { ...ex, segments: [...ex.segments, { ...ex.segments[0]!, id: 'c', text: ' ' }] };
    expect(
      toStudentProjection(toContent(draft), toExpectedAnswers(draft)).segments.map((s) => s.id),
    ).toEqual(['a', 'b']);
    expect(toStudentProjection(toContent(ex), {}).segments).toEqual([]);
  });

  it('graded settings: one check, no hint, no reveal; the count stays as authored', () => {
    const ex = sample();
    const p = toStudentProjection(toContent(ex), toExpectedAnswers(ex));
    expect((withGradedSettings(p) as typeof p).settings).toEqual({
      attempts: 1,
      hints: false,
      revealKey: false,
      showWordCount: false,
    });
  });
});
