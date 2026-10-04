// SPEC_api_contract §1 as amended by decision Q3-A, AC-B1, AC-B5, AC-B9.

import { describe, expect, it } from 'vitest';

import { seg, sample } from './fixtures.test-support.js';
import type { Issue, IssueCode } from './issues.js';
import { audioIssuesOf, isReady, issues, stepState } from './issues.js';
import type { DictationContent } from './model.js';
import { emptyContent } from './model.js';

const codes = (ex: DictationContent): IssueCode[] => issues(ex).map((i) => i.code);
const only = (ex: DictationContent, code: IssueCode): Issue[] =>
  issues(ex).filter((i) => i.code === code);

describe('issues', () => {
  it('a valid sample has none, and is ready', () => {
    expect(issues(sample())).toEqual([]);
    expect(audioIssuesOf(sample())).toEqual([
      { code: 'AUD_LIMIT_WITH_SEEK', level: 'info', part: 'rules' },
    ]);
    expect(isReady(sample())).toBe(true);
  });

  it('AC-B1: a blank draft blocks steps 1 and 2 (the clip through the audio layer), step 3 is empty', () => {
    const ex = emptyContent('nb');
    expect(codes(ex)).toEqual(['DICT_NO_TITLE', 'DICT_NO_KEY']);
    expect(audioIssuesOf(ex).map((i) => i.code)).toContain('AUD_NO_CLIP');
    expect(stepState(ex, 1)).toEqual({ s: 'err', errs: 1 });
    expect(stepState(ex, 2)).toEqual({ s: 'err', errs: 1 });
    expect(stepState(ex, 3)).toEqual({ s: 'empty', errs: 0 });
    expect(isReady(ex)).toBe(false);
  });

  it('Q3-A: the layer’s transcript and one-play warnings are silenced for this type', () => {
    const ex = sample();
    const audio = { ...ex.audio, settings: { ...ex.audio.settings, plays: 1 as const } };
    const many = {
      ...ex,
      audio,
      segments: [0, 1, 2, 3, 4].map((k) => seg(`Setning nummer ${k} her.`)),
    };
    const layer = audioIssuesOf(many).map((i) => i.code);
    expect(layer).not.toContain('AUD_NO_TRANSCRIPT');
    expect(layer).not.toContain('AUD_ONE_PLAY_MANY_ITEMS');
    expect(only(many, 'DICT_ONE_PLAY_MANY_SEGMENTS')).toHaveLength(1);
  });

  it('timecodes past the clip or inverted are the layer’s', () => {
    const ex = sample();
    const bad = {
      ...ex,
      segments: [
        { ...ex.segments[0]!, audio: { start: 9, end: 3 } },
        { ...ex.segments[1]!, audio: { start: 7, end: 99 } },
      ],
    };
    expect(audioIssuesOf(bad).map((i) => i.code)).toEqual([
      'AUD_SEG_INVERTED',
      'AUD_SEG_BEYOND',
      'AUD_LIMIT_WITH_SEEK',
    ]);
  });

  it('each code fires on its own broken draft and names the segment', () => {
    const ex = sample();
    const cases: Array<[IssueCode, DictationContent]> = [
      ['DICT_NO_TITLE', { ...ex, title: ' ' }],
      ['DICT_CLIP_TOO_LONG', { ...ex, audio: { ...ex.audio, duration: 181 } }],
      ['DICT_EMPTY_SEGMENT', { ...ex, segments: [...ex.segments, seg('')] }],
      ['DICT_SEGMENT_TOO_LONG', { ...ex, segments: [seg(Array(19).fill('ord').join(' '))] }],
      ['DICT_SEGMENT_TOO_SHORT', { ...ex, segments: [seg('To ord.')] }],
      [
        'DICT_TIMECODE_MISSING',
        { ...ex, segments: [ex.segments[0]!, { ...ex.segments[1]!, audio: null }] },
      ],
      [
        'DICT_DUPLICATE_SEGMENT',
        { ...ex, segments: [...ex.segments, seg('på kjøkkenet  står det en skje.')] },
      ],
      [
        'DICT_TOO_MANY_SEGMENTS',
        { ...ex, segments: Array.from({ length: 9 }, (_, k) => seg(`Setning nummer ${k} her.`)) },
      ],
      ['DICT_NO_WHY', { ...ex, segments: [{ ...ex.segments[0]!, why: '' }] }],
      ['DICT_NO_FOCUS', { ...ex, segments: ex.segments.map((s) => ({ ...s, focus: [] })) }],
      [
        'DICT_FOCUS_WITHOUT_REASON',
        { ...ex, segments: [{ ...ex.segments[0]!, focus: [{ id: 'f', wordIndex: 1, why: '' }] }] },
      ],
      [
        'DICT_TRANSCRIPT_ALWAYS',
        {
          ...ex,
          audio: { ...ex.audio, settings: { ...ex.audio.settings, transcriptWhen: 'always' } },
        },
      ],
      [
        'DICT_NO_RETRY_NO_KEY',
        { ...ex, settings: { ...ex.settings, attempts: 1, revealKey: false } },
      ],
    ];
    for (const [code, broken] of cases) {
      expect(codes(broken), code).toContain(code);
    }
  });

  it('the six blockers of SPEC_api_contract §1 are blockers; the rest warn', () => {
    const blockers: IssueCode[] = [
      'DICT_NO_TITLE',
      'DICT_NO_KEY',
      'DICT_EMPTY_SEGMENT',
      'DICT_NO_WHY',
      'DICT_TRANSCRIPT_ALWAYS',
    ];
    const ex = { ...sample(), title: '', segments: [seg('Noe her nå.', { why: '' }), seg('')] };
    const all = issues({
      ...ex,
      audio: { ...ex.audio, settings: { ...ex.audio.settings, transcriptWhen: 'always' } },
    });
    for (const i of all) expect(i.level === 'blocker', i.code).toBe(blockers.includes(i.code));
  });

  it('AC-B5: a sentence with no reason blocks on step 3, named by id', () => {
    const ex = sample({ segments: [seg('Vi kom hjem i går.', { id: 'x', why: '' })] });
    expect(only(ex, 'DICT_NO_WHY')).toEqual([
      { code: 'DICT_NO_WHY', level: 'blocker', step: 3, segmentId: 'x' },
    ]);
    expect(stepState(ex, 3)).toEqual({ s: 'err', errs: 1 });
  });

  it('no missing-timecode warning in one-text mode or with fragments off', () => {
    const ex = sample();
    const untimed = { ...ex, segments: ex.segments.map((s) => ({ ...s, audio: null })) };
    expect(codes(untimed)).toContain('DICT_TIMECODE_MISSING');
    expect(codes({ ...untimed, audio: { ...untimed.audio, useSegments: false } })).not.toContain(
      'DICT_TIMECODE_MISSING',
    );
  });
});
