import { describe, expect, it } from 'vitest';

import { blockers, isReady, issues, stepState, warnings } from './issues.js';
import type { Criterion, Point, WritingTaskContent } from './model.js';
import { DEFAULT_AI, DEFAULT_SETTINGS, defaultRubric } from './model.js';

function point(overrides: Partial<Point> = {}): Point {
  return { id: 'p1', text: 'Presenter deg selv', keywords: ['jeg heter'], required: true, ...overrides };
}

function content(overrides: Partial<WritingTaskContent> = {}): WritingTaskContent {
  return {
    mode: 'essay',
    instruction: '',
    prompt: 'Skriv et essay.',
    source: '',
    image: { caption: '', alt: '' },
    letter: { register: 'formal', recipient: '' },
    points: [point()],
    phrases: [],
    model: 'Et eksempelsvar.',
    rubric: defaultRubric(),
    settings: { ...DEFAULT_SETTINGS, ai: { ...DEFAULT_AI } },
    ...overrides,
  };
}

function codesOf(ex: WritingTaskContent) {
  return issues(ex).map((i) => i.code);
}

describe('blockers', () => {
  it('EX_NO_PROMPT — empty prompt', () => {
    expect(codesOf(content({ prompt: '' }))).toContain('EX_NO_PROMPT');
    expect(isReady(content({ prompt: '' }))).toBe(false);
  });

  it('MODE_NO_SOURCE — retell without a source text', () => {
    const ex = content({ mode: 'retell', source: '' });
    expect(codesOf(ex)).toContain('MODE_NO_SOURCE');

    const withSource = content({ mode: 'retell', source: 'En kildetekst.' });
    expect(codesOf(withSource)).not.toContain('MODE_NO_SOURCE');
  });

  it('switching retell -> essay clears the blocker without losing the source text', () => {
    const ex = content({ mode: 'retell', source: '' });
    expect(codesOf(ex)).toContain('MODE_NO_SOURCE');

    const asEssay: WritingTaskContent = { ...ex, mode: 'essay' };
    expect(codesOf(asEssay)).not.toContain('MODE_NO_SOURCE');
  });

  it('MODE_NO_IMAGE — picture without a resolved asset (production rule)', () => {
    expect(codesOf(content({ mode: 'picture', image: { caption: '', alt: '' } }))).toContain('MODE_NO_IMAGE');
    expect(
      codesOf(content({ mode: 'picture', image: { assetId: 'a1', caption: '', alt: '' } })),
    ).not.toContain('MODE_NO_IMAGE');
  });

  it('EX_NO_POINTS — no usable must-cover point', () => {
    expect(codesOf(content({ points: [point({ text: '' })] }))).toContain('EX_NO_POINTS');
    expect(codesOf(content({ points: [] }))).toContain('EX_NO_POINTS');
  });

  it('LEN_MAX_LTE_MIN — maxWords set and <= minWords, but maxWords: 0 is legal', () => {
    const settings = { ...DEFAULT_SETTINGS, ai: { ...DEFAULT_AI }, minWords: 120, maxWords: 100 };
    expect(codesOf(content({ settings }))).toContain('LEN_MAX_LTE_MIN');

    const noCeiling = { ...settings, maxWords: 0 };
    expect(codesOf(content({ settings: noCeiling }))).not.toContain('LEN_MAX_LTE_MIN');
  });

  it('RUBRIC_EMPTY — no criteria', () => {
    expect(codesOf(content({ rubric: [] }))).toContain('RUBRIC_EMPTY');
  });

  it('CRIT_NO_NAME — a criterion has no name', () => {
    const rubric = defaultRubric();
    rubric[0]!.name = '   ';
    expect(codesOf(content({ rubric }))).toContain('CRIT_NO_NAME');
  });

  it('PASS_SCORE_TOO_HIGH — passScore above rubric max, and raising a weight can trigger it', () => {
    const rubric = defaultRubric(); // max = 2*3 + 1*3 + 1*3 + 1*3 = 15
    const settings = { ...DEFAULT_SETTINGS, ai: { ...DEFAULT_AI }, passScore: 15 };
    expect(codesOf(content({ rubric, settings }))).not.toContain('PASS_SCORE_TOO_HIGH');

    const overShot = { ...settings, passScore: 16 };
    expect(codesOf(content({ rubric, settings: overShot }))).toContain('PASS_SCORE_TOO_HIGH');

    // Lowering a weight shrinks the max and can retroactively invalidate a passScore
    // that used to be fine.
    const loweredWeight: Criterion[] = rubric.map((c, i) => (i === 0 ? { ...c, weight: 1 } : c));
    expect(codesOf(content({ rubric: loweredWeight, settings }))).toContain('PASS_SCORE_TOO_HIGH');
  });

  it('server-side: every blocker in the table disables readiness', () => {
    expect(isReady(content())).toBe(true);
    expect(isReady(content({ prompt: '' }))).toBe(false);
  });
});

describe('warnings', () => {
  it('MODE_NO_RECIPIENT — letter without a recipient', () => {
    expect(codesOf(content({ mode: 'letter', letter: { register: 'formal', recipient: '' } }))).toContain(
      'MODE_NO_RECIPIENT',
    );
  });

  it('POINTS_TOO_MANY — more than five points', () => {
    const points = Array.from({ length: 6 }, (_, i) => point({ id: `p${i}`, text: `Punkt ${i}` }));
    expect(codesOf(content({ points }))).toContain('POINTS_TOO_MANY');
  });

  it('POINT_NO_KEYWORDS — only fires when settings.ai.task is on', () => {
    const noKeywords = [point({ keywords: [] })];
    const ai = { ...DEFAULT_AI, task: true };
    expect(codesOf(content({ points: noKeywords, settings: { ...DEFAULT_SETTINGS, ai } }))).toContain(
      'POINT_NO_KEYWORDS',
    );

    const aiOff = { ...DEFAULT_AI, task: false };
    expect(codesOf(content({ points: noKeywords, settings: { ...DEFAULT_SETTINGS, ai: aiOff } }))).not.toContain(
      'POINT_NO_KEYWORDS',
    );
  });

  it('EX_NO_MODEL — missing example answer is a warning, never a blocker', () => {
    const ex = content({ model: '' });
    expect(codesOf(ex)).toContain('EX_NO_MODEL');
    expect(blockers(ex).map((i) => i.code)).not.toContain('EX_NO_MODEL');
  });

  it('TIMER_TOO_SHORT — timer under 10 min with minWords over 120', () => {
    const settings = { ...DEFAULT_SETTINGS, ai: { ...DEFAULT_AI }, timer: 5, minWords: 150 };
    expect(codesOf(content({ settings }))).toContain('TIMER_TOO_SHORT');
  });

  it('CRIT_LEVEL_EMPTY — an empty level descriptor', () => {
    const rubric = defaultRubric();
    rubric[0]!.levels = ['', 'a', 'b', 'c'];
    expect(codesOf(content({ rubric }))).toContain('CRIT_LEVEL_EMPTY');
  });

  it('AI_NO_SELF_LIMIT — studentBefore visibility with a zero self-limit', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      ai: { ...DEFAULT_AI },
      aiStage: true,
      aiVisibility: 'studentBefore' as const,
      aiSelfLimit: 0 as const,
    };
    expect(codesOf(content({ settings }))).toContain('AI_NO_SELF_LIMIT');
  });
});

describe('info', () => {
  it('AI_STAGE_OFF_DRAFT_ON — ai.draft on while the stage itself is off', () => {
    const settings = { ...DEFAULT_SETTINGS, aiStage: false, ai: { ...DEFAULT_AI, draft: true } };
    const ex = content({ settings });
    expect(codesOf(ex)).toContain('AI_STAGE_OFF_DRAFT_ON');
    // Info-level issues never gate readiness or the step dot.
    expect(isReady(ex)).toBe(true);
    expect(warnings(ex).map((i) => i.code)).not.toContain('AI_STAGE_OFF_DRAFT_ON');
  });
});

describe('stepState', () => {
  // The prototype's "empty" branch (BEHAVIOR.md §1: "grey, step 1 only, no prompt yet")
  // is ported verbatim, but EX_NO_PROMPT is itself a step-1 blocker, so the "err" branch
  // — checked first — always wins over "empty" while the prompt is blank. Faithful to
  // the source, not exercised by a document this validator can produce.
  it('is "err", not "empty", when the prompt is blank — EX_NO_PROMPT wins', () => {
    expect(stepState(content({ prompt: '' }), 1)).toEqual({ s: 'err', errs: 1 });
  });

  it('is "err" with a count when the step has blockers', () => {
    const ex = content({ points: [] }); // EX_NO_POINTS, step 1 blocker
    expect(stepState(ex, 1)).toEqual({ s: 'err', errs: 1 });
  });

  it('is "warn" when the step has warnings but no blockers', () => {
    const ex = content({ mode: 'letter', letter: { register: 'formal', recipient: '' } });
    expect(stepState(ex, 1)).toEqual({ s: 'warn', errs: 0 });
  });

  it('is "ok" when the step is clean', () => {
    expect(stepState(content(), 1)).toEqual({ s: 'ok', errs: 0 });
  });

  it('ignores info-level issues entirely', () => {
    const settings = { ...DEFAULT_SETTINGS, aiStage: false, ai: { ...DEFAULT_AI, draft: true } };
    expect(stepState(content({ settings }), 4)).toEqual({ s: 'ok', errs: 0 });
  });
});
