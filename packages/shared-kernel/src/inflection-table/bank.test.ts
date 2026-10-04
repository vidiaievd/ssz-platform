// The bank (plan 69 §3.6) and its generated distractors (decision Q2-A).

import { describe, expect, it } from 'vitest';

import { bankForms, distractors, distractorShortfall, inBank } from './bank.js';
import { norm } from './compare.js';
import { pickParadigm, updateInput } from './edits.js';
import { sampleContent } from './fixture.js';

const bankDoc = (bankExtra = 3) => updateInput(sampleContent(), { mode: 'bank', bankExtra });

describe('distractors', () => {
  it('are the right stem with an ending from the wrong pattern', () => {
    // Round one offers each cell's first pattern: `jobben`, `jobber`, `jobbene`, `boken`, `boka`
    // and `husene` are keys or variants and drop out.
    expect(distractors(bankDoc(5))).toEqual(['boker', 'bokene', 'husen', 'huser', 'søsterer']);
  });

  it('are never a key, a variant or a given form anywhere in the table', () => {
    const ex = bankDoc(5);
    const taken = new Set<string>();
    for (const row of ex.rows) {
      for (const cell of Object.values(row.cells)) {
        [cell.value, ...cell.accept].forEach((f) => taken.add(norm(f)));
      }
    }
    const got = distractors(ex);
    expect(got).toHaveLength(5);
    for (const d of got) expect(taken.has(norm(d))).toBe(false);
    // `boken` is a variant of `boka`, `søsteren` of `søstera`: neither may be offered as wrong.
    expect(got).not.toContain('boken');
    expect(got).not.toContain('søsteren');
  });

  it('take turns across cells instead of piling on the first row', () => {
    const rows = new Set(
      distractors(bankDoc(4)).map((d) =>
        ['jobb', 'bok', 'hus', 'søster'].find((s) => d.startsWith(s)),
      ),
    );
    expect(rows.size).toBeGreaterThan(1);
  });

  it('are deterministic', () => {
    expect(distractors(bankDoc(5))).toEqual(distractors(bankDoc(5)));
  });

  it('respect the count, including zero', () => {
    expect(distractors(bankDoc(0))).toEqual([]);
    expect(distractors(bankDoc(2))).toHaveLength(2);
  });

  it('report a shortfall when the pack cannot make enough', () => {
    // A verb table without rows has nothing to stem.
    const empty = updateInput(pickParadigm(sampleContent(), 'verb'), {
      mode: 'bank',
      bankExtra: 3,
    });
    expect(distractorShortfall(empty)).toBe(3);
    expect(distractorShortfall(bankDoc(3))).toBe(0);
    expect(distractorShortfall(sampleContent())).toBe(0);
  });
});

describe('bankForms', () => {
  it('every key once, then the distractors; variants are not offered', () => {
    const forms = bankForms(bankDoc(3));
    // `hus` is the key of one cell only (the indefinite singular is given), twelve keys in all.
    expect(forms.slice(0, 12)).toContain('bøkene');
    expect(forms).toHaveLength(12 + 3);
    expect(forms).not.toContain('boken');
    expect(new Set(forms.map(norm)).size).toBe(forms.length);
  });

  it('inBank reads a form by its normalised spelling', () => {
    expect(inBank(bankDoc(), ' Bøkene ')).toBe(true);
    expect(inBank(bankDoc(), 'katten')).toBe(false);
  });
});
