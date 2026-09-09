// README §"Validation rules" — every blocker, every warning, the distractor audit, and
// the rail dots that filter them.

import { describe, expect, it } from 'vitest';

import type { IssueCode } from './issues.js';
import { audit, blockers, coverage, isReady, issues, stepState, warnings } from './issues.js';
import { content, option, question, settings } from './fixtures.test-support.js';

const codes = (list: readonly { code: IssueCode }[]): IssueCode[] => list.map((i) => i.code);

describe('blockers — the table in README', () => {
  it('a finished document raises none', () => {
    expect(blockers(content())).toEqual([]);
    expect(isReady(content())).toBe(true);
  });

  it('no questions at all', () => {
    expect(codes(blockers(content({ questions: [] })))).toEqual(['EX_NO_QUESTIONS']);
  });

  it('a question with no stem', () => {
    expect(codes(blockers(content({ questions: [question({ stem: '' })] })))).toContain('Q_NO_STEM');
  });

  it('fewer than two filled options', () => {
    const q = question({ options: [option({ id: 'a', text: 'var', correct: true }), option({ id: 'b' })] });
    expect(codes(blockers(content({ questions: [q] })))).toContain('Q_TOO_FEW_OPTIONS');
  });

  it('no option marked correct, and a marked one that is empty', () => {
    const noKey = question({ options: [option({ id: 'a', text: 'er' }), option({ id: 'b', text: 'var' })] });
    const emptyKey = question({
      options: [option({ id: 'a', text: 'er' }), option({ id: 'b', text: 'var' }), option({ id: 'c', correct: true })],
    });
    expect(codes(blockers(content({ questions: [noKey] })))).toContain('Q_NO_KEY');
    expect(codes(blockers(content({ questions: [emptyKey] })))).toContain('Q_NO_KEY');
  });

  it('no finished question at all', () => {
    const ex = content({ questions: [question({ stem: '' })] });
    expect(codes(blockers(ex))).toContain('EX_NO_ANSWERABLE_QUESTION');
  });

  it('a question with no explanation of the right answer', () => {
    const ex = content({ questions: [question({ why: '  ' })] });
    expect(codes(blockers(ex))).toContain('Q_NO_WHY');
    expect(isReady(ex)).toBe(false);
  });
});

describe('warnings', () => {
  it('an empty option is a warning, not a blocker', () => {
    const q = question({
      options: [
        option({ id: 'a', text: 'er' }),
        option({ id: 'b', text: 'var', correct: true }),
        option({ id: 'c', text: '' }),
      ],
    });
    const ex = content({ questions: [q] });
    expect(codes(warnings(ex))).toContain('Q_EMPTY_OPTION');
    expect(isReady(ex)).toBe(true);
  });

  it('a reading question with no passage', () => {
    const ex = content({ questions: [question({ kind: 'reading', context: '' })] });
    expect(codes(warnings(ex))).toContain('Q_NO_PASSAGE');
  });

  it('instant with retries, and the 50/50 that can never fire', () => {
    expect(codes(issues(content({ settings: settings({ instant: true, retry: 'one' }) })))).toContain(
      'INSTANT_WITH_RETRY',
    );
    expect(codes(issues(content({ settings: settings({ eliminate: true, retry: 'none' }) })))).toContain(
      'ELIMINATE_WITHOUT_RETRY',
    );
  });

  it('per-option feedback switched on with nothing written', () => {
    const q = question({
      options: [
        option({ id: 'a', text: 'er' }),
        option({ id: 'b', text: 'var', correct: true }),
        option({ id: 'c', text: 'har vært' }),
      ],
    });
    expect(codes(issues(content({ questions: [q] })))).toContain('NO_OPTION_FEEDBACK');
  });
});

describe('distractor audit', () => {
  it('flags two options that say the same thing, on the second one', () => {
    const q = question({
      options: [
        option({ id: 'a', text: 'var', correct: true }),
        option({ id: 'b', text: 'Er' }),
        option({ id: 'c', text: ' er ' }),
      ],
    });
    const flags = audit(q).filter((f) => f.code === 'OPT_DUPLICATE');
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ optionId: 'c' });
  });

  it('flags a key much longer than the distractors, but only past 18 characters', () => {
    const long = question({
      options: [
        option({ id: 'a', text: 'Fordi verbet kommer på andreplass i en helsetning', correct: true }),
        option({ id: 'b', text: 'Fordi' }),
        option({ id: 'c', text: 'Ikke' }),
      ],
    });
    const short = question({
      options: [
        option({ id: 'a', text: 'varm', correct: true }),
        option({ id: 'b', text: 'ny' }),
        option({ id: 'c', text: 'ok' }),
      ],
    });
    expect(codes(audit(long))).toContain('KEY_TOO_LONG');
    expect(codes(audit(short))).not.toContain('KEY_TOO_LONG');
  });

  it('flags a key much shorter than the distractors', () => {
    const q = question({
      options: [
        option({ id: 'a', text: 'var', correct: true }),
        option({ id: 'b', text: 'hadde vært syk lenge' }),
        option({ id: 'c', text: 'skulle ha vært syk' }),
      ],
    });
    expect(codes(audit(q))).toContain('KEY_TOO_SHORT');
  });

  it('calls two options a coin flip', () => {
    const q = question({
      options: [option({ id: 'a', text: 'Riktig', correct: true }), option({ id: 'b', text: 'Galt' })],
    });
    expect(codes(audit(q))).toContain('Q_TWO_OPTIONS');
  });

  it('flags absolute wording only in the language of the course', () => {
    const q = question({
      options: [
        option({ id: 'a', text: 'var', correct: true }),
        option({ id: 'b', text: 'er alltid' }),
        option({ id: 'c', text: 'har vært' }),
      ],
    });
    expect(codes(audit(q, { language: 'nb' }))).toContain('OPT_ABSOLUTE');
    expect(codes(audit(q, { language: 'pl' }))).not.toContain('OPT_ABSOLUTE');
    expect(codes(audit(q))).not.toContain('OPT_ABSOLUTE');
  });

  it('flags «alle av svarene»', () => {
    const q = question({
      options: [
        option({ id: 'a', text: 'var', correct: true }),
        option({ id: 'b', text: 'er' }),
        option({ id: 'c', text: 'Alle av svarene' }),
      ],
    });
    expect(codes(audit(q, { language: 'nb' }))).toContain('OPT_ALL_OF_THESE');
  });
});

describe('coverage', () => {
  it('counts wrong options, the rebuttals written for them, and questions without a rule', () => {
    const q1 = question();
    const q2 = question({ id: 'q2', why: '' });
    expect(coverage(content({ questions: [q1, q2] }))).toMatchObject({
      wrongs: 4,
      written: 2,
      noWhy: 1,
      total: 2,
    });
  });

  it('counts a question the audit is silent about as clean', () => {
    const clean = question({
      options: [
        option({ id: 'a', text: 'var', correct: true }),
        option({ id: 'b', text: 'er' }),
        option({ id: 'c', text: 'blir' }),
      ],
    });
    const flagged = question({
      id: 'q2',
      options: [option({ id: 'a', text: 'Riktig', correct: true }), option({ id: 'b', text: 'Galt' })],
    });
    expect(coverage(content({ questions: [clean, flagged] }))).toMatchObject({ clean: 1, total: 2 });
  });
});

describe('stepState', () => {
  it('reports err with a count, warn, and ok', () => {
    const broken = content({ questions: [question({ stem: '' })] });
    expect(stepState(broken, 1).s).toBe('err');
    expect(stepState(broken, 1).errs).toBeGreaterThan(0);

    const warned = content({ settings: settings({ instant: true, retry: 'one' }) });
    expect(stepState(warned, 3)).toEqual({ s: 'warn', errs: 0 });

    expect(stepState(content(), 1)).toEqual({ s: 'ok', errs: 0 });
  });

  it('reports empty on a step with no rules of its own while nothing is written', () => {
    const blank = content({ questions: [question({ stem: '', why: '', options: [option({ id: 'a' }), option({ id: 'b' })] })] });
    expect(stepState(blank, 3).s).toBe('empty');
  });

  it('ignores info-level flags — they are inline only', () => {
    const q = question({
      options: [
        option({ id: 'a', text: 'var', correct: true }),
        option({ id: 'b', text: 'er alltid', why: 'nei' }),
        option({ id: 'c', text: 'blir' }),
      ],
    });
    expect(stepState(content({ questions: [q] }), 2, { language: 'nb' })).toEqual({ s: 'ok', errs: 0 });
  });
});
