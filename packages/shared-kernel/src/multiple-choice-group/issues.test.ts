// README §"Validation rules" — every blocker, warning and info, plus the statement audit.
// IMPLEMENTATION.md test checklist: "`mgIssues` returns exactly the blockers listed in
// README.md for each broken model."

import { describe, expect, it } from 'vitest';

import { audit, blockers, isReady, issues, stepState } from './issues.js';
import { emptyContent, PRESETS } from './model.js';
import { applyPreset } from './presets.js';
import { codes, col, exercise, row, settings } from './fixtures.test-support.js';

const NB = { language: 'nb' };

describe('a finished document', () => {
  it('raises no blockers', () => {
    expect(blockers(exercise(), NB)).toEqual([]);
    expect(isReady(exercise(), NB)).toBe(true);
  });
});

describe('step 1 — columns and the material', () => {
  it('blocks on fewer than two columns', () => {
    const ex = exercise({ columns: [col('Riktig')] });
    expect(codes(blockers(ex))).toContain('COL_TOO_FEW');
  });

  it('blocks on more than four', () => {
    const ex = exercise({ columns: [col('A'), col('B'), col('C'), col('D'), col('E')] });
    expect(codes(blockers(ex))).toContain('COL_TOO_MANY');
  });

  it('blocks on an unnamed column, naming it', () => {
    const blank = col('');
    const ex = exercise({ columns: [col('Riktig'), blank] });
    expect(blockers(ex)).toContainEqual({
      code: 'COL_NO_LABEL',
      level: 'blocker',
      step: 1,
      columnId: blank.id,
    });
  });

  it('blocks on duplicate labels, flagging the second', () => {
    const first = col('Riktig');
    const second = col('riktig');
    const ex = exercise({ columns: [first, second] });
    expect(blockers(ex)).toContainEqual({
      code: 'COL_DUPLICATE',
      level: 'blocker',
      step: 1,
      columnId: second.id,
    });
  });

  it('blocks on an inline source with no text', () => {
    const ex = exercise({ source: { mode: 'inline', label: 'Text', text: '  ' } });
    expect(codes(blockers(ex))).toContain('SOURCE_EMPTY');
  });

  it('warns on a missing instruction', () => {
    expect(codes(issues(exercise({ instruction: '' })))).toContain('EX_NO_INSTRUCTION');
  });

  it('notes answering from memory when no text is attached', () => {
    expect(codes(issues(exercise()))).toContain('SOURCE_NONE');
  });

  it('says nothing about the source on an empty document', () => {
    const ex = exercise({ rows: [] });
    expect(codes(issues(ex))).not.toContain('SOURCE_NONE');
  });
});

describe('step 2 — statements', () => {
  it('blocks on no rows at all', () => {
    expect(codes(blockers(exercise({ rows: [] })))).toContain('EX_NO_ROWS');
  });

  it('blocks a written statement with no answer, naming the row', () => {
    const orphan = row('Written, unmarked.');
    const ex = exercise({ rows: [...exercise().rows, orphan] });
    expect(blockers(ex)).toContainEqual({
      code: 'ROW_NO_ANSWER',
      level: 'blocker',
      step: 2,
      rowId: orphan.id,
    });
  });

  it('blocks on fewer than two finished statements', () => {
    const right = col('Riktig');
    const ex = exercise({ columns: [right, col('Galt')], rows: [row('Only one.', right.id)] });
    expect(codes(blockers(ex))).toContain('EX_TOO_FEW_READY');
  });

  it('blocks an untouched document — an empty table must not be publishable', () => {
    // The prototype guards this blocker with "at least one row is written", which leaves
    // the four-blank-row scaffold with no blockers and the gate offering to publish it.
    const scaffold = emptyContent();
    expect(codes(blockers(scaffold))).toContain('EX_TOO_FEW_READY');
    expect(isReady(scaffold)).toBe(false);
  });

  it('warns about empty rows, counted — they are dropped, not fixed one by one', () => {
    const ex = exercise({ rows: [...exercise().rows, row(''), row('  ')] });
    expect(issues(ex)).toContainEqual({ code: 'ROW_EMPTY', level: 'warning', step: 2, count: 2 });
  });
});

describe('statement audit', () => {
  const twoCol = () => {
    const right = col('Riktig');
    const wrong = col('Galt');
    return { right, wrong };
  };

  it('flags two statements that say the same thing, on the second', () => {
    const { right, wrong } = twoCol();
    const dup = row('Han kom for sent.', wrong.id);
    const ex = exercise({
      columns: [right, wrong],
      rows: [row('Han kom for sent.', right.id), dup, row('c', right.id), row('d', wrong.id)],
    });
    expect(audit(ex, NB)).toContainEqual({
      code: 'ROW_DUPLICATE',
      level: 'warning',
      step: 2,
      rowId: dup.id,
    });
  });

  it('ignores trailing punctuation when comparing', () => {
    const { right, wrong } = twoCol();
    const ex = exercise({
      columns: [right, wrong],
      rows: [row('Han kom.', right.id), row('han kom', wrong.id)],
    });
    expect(codes(audit(ex, NB))).toContain('ROW_DUPLICATE');
  });

  it('flags a statement over 170 characters', () => {
    const { right, wrong } = twoCol();
    const long = row('a'.repeat(171), right.id);
    const ex = exercise({ columns: [right, wrong], rows: [long, row('b', wrong.id)] });
    expect(audit(ex, NB)).toContainEqual({
      code: 'ROW_TOO_LONG',
      level: 'warning',
      step: 2,
      rowId: long.id,
      length: 171,
    });
  });

  it('flags two negations in one statement', () => {
    const { right, wrong } = twoCol();
    const doubled = row('Det er ikke sant at han ikke kom.', wrong.id);
    const ex = exercise({ columns: [right, wrong], rows: [doubled, row('b', right.id)] });
    expect(codes(audit(ex, NB))).toContain('ROW_DOUBLE_NEGATIVE');
  });

  it('flags absolutes at info level', () => {
    const { right, wrong } = twoCol();
    const absolute = row('Alle syklister har lys.', wrong.id);
    const ex = exercise({ columns: [right, wrong], rows: [absolute, row('b', right.id)] });
    expect(audit(ex, NB)).toContainEqual({
      code: 'ROW_ABSOLUTE',
      level: 'info',
      step: 2,
      rowId: absolute.id,
    });
  });

  it('stays silent on the language-bound checks without a pack', () => {
    const { right, wrong } = twoCol();
    const ex = exercise({
      columns: [right, wrong],
      rows: [row('Alle syklister har ikke lys og ikke bremser.', wrong.id), row('b', right.id)],
    });
    const found = codes(audit(ex, { language: 'sw' }));
    expect(found).not.toContain('ROW_ABSOLUTE');
    expect(found).not.toContain('ROW_DOUBLE_NEGATIVE');
  });

  it('flags a question under Riktig/Galt but not under Ja/Nei', () => {
    const { right, wrong } = twoCol();
    const question = row('Kom han for sent?', right.id);
    const rg = exercise({ columns: [right, wrong], rows: [question, row('b', wrong.id)] });
    expect(codes(audit(rg, NB))).toContain('ROW_IS_QUESTION');

    const jn = applyPreset(rg, PRESETS.find((p) => p.id === 'jn')!);
    expect(codes(audit(jn, NB))).not.toContain('ROW_IS_QUESTION');
  });

  it('flags a lopsided key at 80% over at least four rows', () => {
    const { right, wrong } = twoCol();
    const four = exercise({
      columns: [right, wrong],
      rows: [row('a', right.id), row('b', right.id), row('c', right.id), row('d', right.id)],
    });
    expect(audit(four, NB)).toContainEqual({
      code: 'KEY_LOPSIDED',
      level: 'warning',
      step: 2,
      columnId: right.id,
      share: 1,
    });

    const three = exercise({
      columns: [right, wrong],
      rows: [row('a', right.id), row('b', right.id), row('c', right.id)],
    });
    expect(codes(audit(three, NB))).not.toContain('KEY_LOPSIDED');
  });

  it('flags an unused column from three ready rows up', () => {
    const { right, wrong } = twoCol();
    const three = exercise({
      columns: [right, wrong],
      rows: [row('a', right.id), row('b', right.id), row('c', right.id)],
    });
    expect(audit(three, NB)).toContainEqual({
      code: 'COL_UNUSED',
      level: 'warning',
      step: 2,
      columnId: wrong.id,
    });

    const two = exercise({ columns: [right, wrong], rows: [row('a', right.id), row('b', right.id)] });
    expect(codes(audit(two, NB))).not.toContain('COL_UNUSED');
  });

  it('notes a short table and a long one', () => {
    const { right, wrong } = twoCol();
    const short = exercise({ columns: [right, wrong], rows: [row('a', right.id), row('b', wrong.id)] });
    expect(codes(audit(short, NB))).toContain('EX_FEW_ROWS');

    const long = exercise({
      columns: [right, wrong],
      rows: Array.from({ length: 16 }, (_, i) => row(`row ${i}`, i % 2 ? right.id : wrong.id)),
    });
    expect(codes(audit(long, NB))).toContain('EX_MANY_ROWS');
  });
});

describe('step 3 — difficulty', () => {
  it('warns when one attempt is paired with no key', () => {
    const ex = exercise({ settings: settings({ retry: 'none', revealKey: false }) });
    expect(codes(issues(ex))).toContain('NO_RETRY_NO_KEY');
  });

  it('warns when unlimited retries are paired with nothing locked', () => {
    const ex = exercise({ settings: settings({ retry: 'unlimited', lockCorrect: false }) });
    expect(codes(issues(ex))).toContain('UNLIMITED_UNLOCKED');
  });

  it('notes a pass mark near chance', () => {
    const ex = exercise({ settings: settings({ passThreshold: 40 }) });
    expect(issues(ex)).toContainEqual({
      code: 'THRESHOLD_NEAR_CHANCE',
      level: 'info',
      step: 3,
      threshold: 40,
    });
  });
});

describe('step 4 — feedback', () => {
  it('blocks when explanations are on and none is written', () => {
    const ex = exercise({ rows: exercise().rows.map((r) => ({ ...r, why: '' })) });
    expect(codes(blockers(ex))).toContain('NO_EXPLANATIONS');
  });

  it('says nothing when explanations are switched off', () => {
    const ex = exercise({
      rows: exercise().rows.map((r) => ({ ...r, why: '' })),
      settings: settings({ showWhy: 'never' }),
    });
    expect(codes(issues(ex))).not.toContain('NO_EXPLANATIONS');
  });

  it('warns per row when some are explained and others are not', () => {
    const base = exercise();
    const bare = { ...base.rows[2]!, why: '' };
    const ex = exercise({ rows: [base.rows[0]!, base.rows[1]!, bare, base.rows[3]!] });
    expect(issues(ex)).toContainEqual({
      code: 'ROW_NO_WHY',
      level: 'warning',
      step: 4,
      rowId: bare.id,
    });
  });

  it('notes an inline text no statement quotes', () => {
    const ex = exercise({ source: { mode: 'inline', label: 'T', text: 'Some passage.' } });
    expect(codes(issues(ex))).toContain('NO_QUOTES');
  });

  it('warns about a quote that is not in the text, but does not block', () => {
    const base = exercise();
    const quoted = { ...base.rows[0]!, quote: 'never written' };
    const ex = exercise({
      source: { mode: 'inline', label: 'T', text: 'Some passage.' },
      rows: [quoted, ...base.rows.slice(1)],
    });
    expect(issues(ex)).toContainEqual({
      code: 'QUOTE_NOT_IN_TEXT',
      level: 'warning',
      step: 4,
      rowId: quoted.id,
    });
    expect(isReady(ex)).toBe(true);
  });

  it('does not check quotes when the text is not inline', () => {
    const base = exercise();
    const ex = exercise({ rows: [{ ...base.rows[0]!, quote: 'anything' }, ...base.rows.slice(1)] });
    expect(codes(issues(ex))).not.toContain('QUOTE_NOT_IN_TEXT');
  });
});

describe('stepState', () => {
  it('reports err with a count, and warn without one', () => {
    const ex = exercise({ columns: [col('Riktig')] });
    expect(stepState(ex, 1)).toEqual({ s: 'err', errs: 1 });
    expect(stepState(exercise({ instruction: '' }), 1)).toEqual({ s: 'warn', errs: 0 });
  });

  it('reports empty only on step 2, and only with no written row — B5', () => {
    const blank = exercise({ rows: [row(''), row('')], instruction: 'Read.' });
    expect(stepState(blank, 2).s).toBe('empty');
    expect(stepState(exercise(), 2, NB).s).toBe('ok');
  });

  it('shows the rail empty on an untouched document while the gate still refuses it', () => {
    // The two questions are different: "has this author started?" and "may this be
    // published?". Plan 54 §5 deviation 5.
    const scaffold = emptyContent();
    expect(stepState(scaffold, 2).s).toBe('empty');
    expect(isReady(scaffold)).toBe(false);
  });

  it('warns about empty rows once at least one is written', () => {
    const ex = exercise({ rows: [...exercise().rows, row('')] });
    expect(stepState(ex, 2, NB)).toEqual({ s: 'warn', errs: 0 });
  });

  it('ignores info-level issues', () => {
    // SOURCE_NONE is info and sits on step 1; a document with nothing else wrong there
    // must still show green.
    expect(stepState(exercise(), 1).s).toBe('ok');
  });
});
