// Every issue fires on its own broken model and stays quiet on the neighbouring one (plan 70 §4.3).

import { describe, expect, it } from 'vitest';

import {
  addCriterion,
  addPoint,
  addPrompt,
  removeCriterion,
  setLevel,
  setMode,
  setNote,
  setPassScore,
  setPointText,
  setPrompt,
  setRecording,
  setReview,
  setSettings,
  toggleStudentVisible,
} from './edits.js';
import { sampleDocument, SAMPLE_PROMPT_IDS } from './fixture.js';
import { issues, isReady, stepState, type IssueCode } from './issues.js';
import { emptyContent, type ReadAloudContent } from './model.js';

const ON = { audio: true };
const OFF = { audio: false };
const P1 = SAMPLE_PROMPT_IDS[0];

function codes(ex: ReadAloudContent, ctx = ON): IssueCode[] {
  return issues(ex, ctx).map((i) => i.code);
}

describe('the sample', () => {
  it('is ready and raises nothing above info', () => {
    const ex = sampleDocument();
    expect(isReady(ex, ON)).toBe(true);
    expect(issues(ex, ON).filter((i) => i.level !== 'info')).toEqual([]);
  });
});

describe('step 1', () => {
  it('blocks a prompt without the material of its mode, and only of its mode', () => {
    const ex = setPrompt(sampleDocument(), P1, { text: '' });
    expect(issues(ex, ON)).toContainEqual({
      code: 'RA_PROMPT_NO_MATERIAL',
      level: 'blocker',
      step: 1,
      promptId: P1,
      need: 'text',
    });
    // A passage left over is no credit to a monologue: it needs a picture or a plan.
    const mono = setMode(sampleDocument(), 'monologue');
    expect(codes(mono).filter((c) => c === 'RA_PROMPT_NO_MATERIAL')).toHaveLength(2);
    // An empty plan row is a draft, not a point.
    expect(codes(addPoint(mono, P1)).filter((c) => c === 'RA_PROMPT_NO_MATERIAL')).toHaveLength(2);
  });

  it('accepts a monologue with a plan point or a picture', () => {
    let ex = setMode(sampleDocument(), 'monologue');
    ex = addPoint(ex, P1);
    ex = setPointText(ex, P1, ex.prompts[0]!.plan[0]!.id, 'Hvem er på bildet?');
    ex = setPrompt(ex, SAMPLE_PROMPT_IDS[1], { image: { assetId: 'img', caption: '', alt: '' } });
    expect(codes(ex)).not.toContain('RA_PROMPT_NO_MATERIAL');
  });

  it('asks a dialogue for the partner line', () => {
    const ex = setMode(sampleDocument(), 'dialogue');
    expect(codes(ex).filter((c) => c === 'RA_PROMPT_NO_MATERIAL')).toHaveLength(2);
    const answered = setPrompt(
      setPrompt(ex, P1, { turn: { situation: '', partner: 'Hei!' } }),
      SAMPLE_PROMPT_IDS[1],
      { turn: { situation: '', partner: 'Hva vil du?' } },
    );
    expect(codes(answered)).not.toContain('RA_PROMPT_NO_MATERIAL');
  });

  it('warns about a passage over 90 words and a plan over five points', () => {
    const long = Array.from({ length: 91 }, () => 'ord').join(' ');
    expect(codes(setPrompt(sampleDocument(), P1, { text: long }))).toContain('RA_TEXT_TOO_LONG');
    expect(codes(sampleDocument())).not.toContain('RA_TEXT_TOO_LONG');
    let mono = setMode(sampleDocument(), 'monologue');
    for (let i = 0; i < 6; i++) mono = addPoint(mono, P1);
    mono = { ...mono, prompts: mono.prompts.map((p) => ({ ...p, plan: p.plan.map((x) => ({ ...x, text: 'punkt' })) })) };
    expect(codes(mono)).toContain('RA_PLAN_TOO_LONG');
  });

  it('warns past four prompts', () => {
    let ex = sampleDocument();
    ex = addPrompt(addPrompt(ex));
    expect(codes(ex)).not.toContain('RA_MANY_PROMPTS');
    expect(codes(addPrompt(ex))).toContain('RA_MANY_PROMPTS');
  });

  it('wants a model reading for `read` and notes a text-only partner line for `dialogue`', () => {
    expect(codes(sampleDocument(), OFF)).toContain('RA_NO_MODEL');
    expect(codes(sampleDocument(), ON)).not.toContain('RA_NO_MODEL');
    const dia = setMode(sampleDocument(), 'dialogue');
    expect(codes(dia, OFF)).toContain('RA_PARTNER_TEXT_ONLY');
    expect(codes(dia, OFF)).not.toContain('RA_NO_MODEL');
  });

  it('blocks an exercise with no prompt', () => {
    expect(codes({ ...sampleDocument(), prompts: [] })).toContain('RA_NO_PROMPTS');
  });
});

describe('step 2', () => {
  it('blocks a prompt without a listening note', () => {
    expect(issues(setNote(sampleDocument(), P1, '  '), ON)).toContainEqual({
      code: 'RA_NO_NOTE',
      level: 'blocker',
      step: 2,
      promptId: P1,
    });
  });

  it('warns a reading with no focus word anywhere', () => {
    const bare = { ...sampleDocument(), prompts: sampleDocument().prompts.map((p) => ({ ...p, focus: [] })) };
    expect(codes(bare)).toContain('RA_NO_FOCUS');
    expect(codes(setMode(bare, 'monologue'))).not.toContain('RA_NO_FOCUS');
  });
});

describe('step 3', () => {
  it('blocks an empty rubric, an unnamed criterion and an unreachable pass mark', () => {
    expect(codes({ ...sampleDocument(), rubric: [] })).toContain('RA_RUBRIC_EMPTY');
    const unnamed = addCriterion(sampleDocument());
    expect(codes(unnamed)).toContain('RA_CRITERION_NO_NAME');
    expect(codes(setPassScore(sampleDocument(), 15))).not.toContain('RA_PASS_ABOVE_MAX');
    expect(issues(setPassScore(sampleDocument(), 16), ON)).toContainEqual({
      code: 'RA_PASS_ABOVE_MAX',
      level: 'blocker',
      step: 3,
      passScore: 16,
      max: 15,
    });
  });

  it('warns an empty descriptor and a rubric nobody sees', () => {
    const ex = sampleDocument();
    expect(codes(setLevel(ex, 'pron', 1, ''))).toContain('RA_LEVEL_EMPTY');
    let hidden = ex;
    for (const c of ex.rubric) hidden = toggleStudentVisible(hidden, c.id);
    expect(codes(hidden)).toContain('RA_RUBRIC_HIDDEN');
    expect(codes(toggleStudentVisible(ex, 'pron'))).not.toContain('RA_RUBRIC_HIDDEN');
  });

  it('notes a model reading never replayed, only when there is one', () => {
    const never = setSettings(sampleDocument(), { showModel: 'never' });
    expect(codes(never, ON)).toContain('RA_MODEL_NEVER_SHOWN');
    expect(codes(never, OFF)).not.toContain('RA_MODEL_NEVER_SHOWN');
  });

  it('keeps two criteria at least', () => {
    const ex = removeCriterion(removeCriterion(sampleDocument(), 'pron'), 'flow');
    expect(ex.rubric.map((c) => c.id)).toEqual(['flow', 'content']);
  });
});

describe('step 4', () => {
  it('blocks a maximum over the ceiling and a range nothing fits in', () => {
    expect(codes(setPrompt(sampleDocument(), P1, { maxSeconds: 181 }))).toContain('RA_OVER_CEILING');
    expect(codes(setPrompt(sampleDocument(), P1, { maxSeconds: 180 }))).not.toContain('RA_OVER_CEILING');
    expect(codes(setPrompt(sampleDocument(), P1, { minSeconds: 60 }))).toContain('RA_RANGE_INVALID');
  });

  it('warns when the passage takes longer to read than the maximum', () => {
    const long = Array.from({ length: 80 }, () => 'ord').join(' ');
    expect(codes(setPrompt(sampleDocument(), P1, { text: long, maxSeconds: 30 }))).toContain('RA_READ_EXCEEDS_MAX');
  });

  it('warns blind retakes, and notes one take, a pointless choice and no level check', () => {
    expect(codes(setRecording(sampleDocument(), { listenBack: false }))).toContain('RA_BLIND_RETAKES');
    const one = setRecording(sampleDocument(), { takes: 1 });
    expect(codes(one)).toEqual(expect.arrayContaining(['RA_ONE_TAKE', 'RA_CHOOSE_NO_EFFECT']));
    expect(codes(setRecording(setMode(one, 'dialogue'), {}))).not.toContain('RA_ONE_TAKE');
    expect(codes(setRecording(sampleDocument(), { micCheck: false }))).toContain('RA_NO_MIC_CHECK');
  });
});

describe('step 5', () => {
  it('notes that the AI stage calls nothing', () => {
    expect(codes(setReview(sampleDocument(), { aiStage: true }))).toContain('RA_AI_NOT_LIVE');
  });
});

describe('rail dots', () => {
  it('reads an empty draft as empty steps 1 and 2, blocked 2 by notes', () => {
    const ex = emptyContent('nb');
    expect(stepState(ex, 1, ON)).toEqual({ s: 'err', errs: 1 });
    expect(stepState(ex, 2, ON)).toEqual({ s: 'err', errs: 1 });
    expect(stepState(ex, 3, ON)).toEqual({ s: 'ok', errs: 0 });
  });

  it('turns a step amber on a warning and green otherwise', () => {
    expect(stepState(sampleDocument(), 2, ON).s).toBe('ok');
    expect(stepState(setLevel(sampleDocument(), 'pron', 0, ''), 3, ON).s).toBe('warn');
  });

  it('a draft in a language with no default rubric is blocked until the criteria are named', () => {
    expect(codes(emptyContent('uk')).filter((c) => c === 'RA_CRITERION_NO_NAME')).toHaveLength(3);
  });
});
