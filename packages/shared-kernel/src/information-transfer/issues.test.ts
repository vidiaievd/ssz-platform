// The validation engine (plan 73 §4.3): each code fires on its own broken model and not on a
// neighbour's; the rail dot per step.

import { describe, expect, it } from 'vitest';

import {
  addField,
  removeField,
  setAnswering,
  setAudio,
  setExpected,
  setField,
  setGrading,
  setInstruction,
  setLanguage,
  setPassage,
  setScoring,
  setSourceKind,
  setTitle,
} from './edits.js';
import { SAMPLE_FIELD_IDS, sampleContent } from './fixture.js';
import type { IssueCode } from './issues.js';
import { audioIssuesOf, isReady, issues, placedAudioIssues, stepState } from './issues.js';
import type { InformationTransferContent } from './model.js';
import { emptyContent } from './model.js';

const [DATO, KLOKKE, ROM, PRIS, , NAVN] = SAMPLE_FIELD_IDS;
const codes = (ex: InformationTransferContent): IssueCode[] => issues(ex).map((i) => i.code);
const base = (): InformationTransferContent => sampleContent();

describe('the sample', () => {
  it('has only the two «not live» notes', () => {
    expect(codes(base())).toEqual(['INF_SKILL_CARD_LATER', 'INF_EXPOSURE_LATER']);
    expect(isReady(base())).toBe(true);
  });
});

describe('each code on its own broken model (INF-M11)', () => {
  const cases: [IssueCode, (ex: InformationTransferContent) => InformationTransferContent][] = [
    ['INF_NO_PASSAGE', (ex) => setPassage(setSourceKind(ex, 'text'), ' ')],
    ['INF_NO_TRANSCRIPT', (ex) => setAudio(ex, { transcript: '' })],
    ['INF_NO_TITLE', (ex) => setTitle(ex, '')],
    ['INF_NO_INSTRUCTION', (ex) => setInstruction(ex, '')],
    ['INF_NO_PACK', (ex) => setLanguage(ex, 'uk')],
    ['INF_FIELD_NO_LABEL', (ex) => setField(ex, ROM, { label: '' })],
    ['INF_DUPLICATE_LABEL', (ex) => setField(ex, ROM, { label: 'pris' })],
    ['INF_FIELD_NO_KEY', (ex) => setField(ex, ROM, { expected: [''] })],
    ['INF_FIELD_NO_WHY', (ex) => setField(ex, ROM, { why: ' ' })],
    ['INF_KEY_NOT_IN_SOURCE', (ex) => setField(ex, NAVN, { expected: ['Kari Nordmann'] })],
    ['INF_SENTENCE_ANSWER', (ex) => setField(ex, NAVN, { type: 'word', expected: ['meld deg på hos Anne Lise Berg'] })],
    ['INF_FEW_FIELDS', (ex) => ({ ...ex, fields: ex.fields.slice(0, 2) })],
    ['INF_MANY_FIELDS', (ex) => ({ ...ex, fields: [...ex.fields, ...ex.fields.map((f) => ({ ...f, id: `${f.id}x` }))] })],
    ['INF_ALL_FREE_TEXT', (ex) => ({ ...ex, fields: ex.fields.map((f) => ({ ...f, type: 'name' as const })) })],
    ['INF_KEY_UNREADABLE', (ex) => setExpected(ex, ROM, 0, 'halv fire')],
    ['INF_KEY_FAILS_GRADER', (ex) => setExpected(ex, ROM, 0, 'halv fire')],
    ['INF_TIME_AMBIGUOUS', (ex) => setExpected(ex, KLOKKE, 0, 'halv seks')],
    ['INF_TYPOS_ON', (ex) => setGrading(ex, { typos: true })],
    ['INF_SPELLED_OFF', (ex) => setGrading(ex, { spelledNumbers: false })],
    ['INF_CASE_SENSITIVE', (ex) => setGrading(ex, { strictCase: true })],
    ['INF_ONE_PLAY_MANY', (ex) => setAudio(ex, { settings: { ...ex.audio.settings, plays: 1 } })],
    ['INF_NO_SEGMENTS', (ex) => setAudio(ex, { useSegments: false })],
    ['INF_SOURCE_HIDDEN', (ex) => setAnswering(setSourceKind(ex, 'text'), { showSource: 'afterAnswer' })],
    ['INF_PASS_TOO_HIGH', (ex) => setScoring(ex, { passPct: 95 })],
    ['INF_REQUIRED_ALL', (ex) => setGrading(ex, { requiredAll: true })],
    ['INF_NO_MEMORY', (ex) => setScoring(ex, { memory: 'none' })],
  ];
  for (const [code, broken] of cases) {
    it(code, () => {
      expect(codes(broken(base()))).toContain(code);
      expect(codes(base())).not.toContain(code);
    });
  }

  it('INF_NO_FIELDS', () => expect(codes({ ...base(), fields: [] })).toContain('INF_NO_FIELDS'));

  it('a missing explanation is not reported on an unlabelled field', () => {
    const got = codes(setField(base(), ROM, { label: '', why: '' }));
    expect(got).toContain('INF_FIELD_NO_LABEL');
    expect(got).not.toContain('INF_FIELD_NO_WHY');
  });

  it('a format value is never «not in the source»', () => {
    expect(codes(setExpected(base(), PRIS, 0, '999'))).not.toContain('INF_KEY_NOT_IN_SOURCE');
  });

  it('the hidden text is not a problem for a recording', () => {
    expect(codes(setAnswering(base(), { showSource: 'afterAnswer' }))).not.toContain('INF_SOURCE_HIDDEN');
  });

  it('the «not live» notes follow the memory settings', () => {
    const none = setScoring(base(), { memory: 'none', logWordExposure: false });
    expect(codes(none)).not.toContain('INF_SKILL_CARD_LATER');
    expect(codes(none)).not.toContain('INF_EXPOSURE_LATER');
  });

  it('names the field by id and place', () => {
    const issue = issues(setField(base(), ROM, { why: '' })).find((i) => i.code === 'INF_FIELD_NO_WHY');
    expect(issue).toMatchObject({ fieldId: ROM, n: 3, label: 'Rom' });
  });

  it('suggests the 24-hour reading for an ambiguous time', () => {
    const issue = issues(setExpected(base(), KLOKKE, 0, 'halv seks')).find((i) => i.code === 'INF_TIME_AMBIGUOUS');
    expect(issue).toMatchObject({ value: 'halv seks', suggestion: '17:30' });
  });
});

describe('the audio layer', () => {
  it('applies only to a recording', () => {
    const noClip = setAudio(base(), { assetId: '' });
    expect(audioIssuesOf(noClip).map((i) => i.code)).toContain('AUD_NO_CLIP');
    expect(audioIssuesOf(setSourceKind(noClip, 'text'))).toEqual([]);
    expect(isReady(noClip)).toBe(false);
  });

  it('places the layer on this builder’s steps', () => {
    const ex = setField(setAudio(base(), { assetId: '', title: '' }), DATO, { audio: { start: 9, end: 3 } });
    const placed = placedAudioIssues(ex).map((i) => [i.code, i.step]);
    expect(placed).toEqual(
      expect.arrayContaining([
        ['AUD_NO_CLIP', 1],
        ['AUD_NO_TITLE', 1],
        ['AUD_SEG_INVERTED', 2],
      ]),
    );
  });
});

describe('stepState (INF-D3)', () => {
  it('a blank draft', () => {
    const ex = emptyContent('nb');
    expect(stepState(ex, 1)).toEqual({ s: 'err', errs: 1 });
    expect(stepState(ex, 2)).toEqual({ s: 'err', errs: 2 });
    expect(stepState(ex, 3)).toEqual({ s: 'ok', errs: 0 });
    expect(stepState(ex, 5)).toEqual({ s: 'ok', errs: 0 });
  });

  it('empty source and no ready field are «empty», not «ok»', () => {
    const ex = setTitle(setInstruction(emptyContent('nb'), 'x'), 'y');
    expect(stepState(setPassage(ex, ''), 1).s).toBe('err');
    const unlabelled = removeField(addField(ex, 'time', '17:30'), ex.fields[0]!.id);
    expect(stepState(unlabelled, 2).s).toBe('err');
  });

  it('warnings colour the dot, infos do not', () => {
    expect(stepState(base(), 5).s).toBe('ok');
    expect(stepState(setScoring(base(), { passPct: 95 }), 5).s).toBe('warn');
  });
});
