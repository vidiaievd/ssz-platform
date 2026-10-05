// The bank (plan 69 §3.6) and its generated distractors (decision Q2-A).

import { describe, expect, it } from 'vitest';

import { bankForms, distractors, distractorShortfall, inBank } from './bank.js';
import { norm } from './compare.js';
import { pickParadigm, updateInput } from './edits.js';
import { sampleContent } from './fixture.js';
import type { InflectionTableContent } from './model.js';
import { emptyContent, newCell } from './model.js';

const bankDoc = (bankExtra = 3) => updateInput(sampleContent(), { mode: 'bank', bankExtra });

const SLOTS: Record<string, string[]> = {
  noun: ['indefSg', 'defSg', 'indefPl', 'defPl'],
  verb: ['inf', 'pres', 'pret', 'perf'],
  adj: ['pos', 'comp', 'sup'],
};

/** One row of a paradigm, the first form given and the rest asked, with every distractor asked for. */
function oneRow(paradigmId: string, lemma: string, forms: string[]): InflectionTableContent {
  const slots = SLOTS[paradigmId]!;
  const cells = Object.fromEntries(
    slots.map((slotId, i) => [slotId, newCell(forms[i] ?? '', i === 0 ? 'prefill' : 'ask')]),
  );
  return {
    ...emptyContent('nb'),
    paradigmId,
    slots,
    rows: [{ id: 'r', lemma, gloss: '', dictId: null, cells }],
    input: { mode: 'bank', bankExtra: 5, shuffleRows: false },
  };
}

describe('distractors', () => {
  it('are the right stem with an ending from the wrong pattern', () => {
    // Round one offers each cell's first pattern: `jobben`, `jobber`, `jobbene` and `husene` are
    // keys, `boken` and `søsteren` the variants bokmål allows beside `boka` and `søstera`, and
    // `søsterer` is no word.
    expect(distractors(bankDoc(5))).toEqual(['boker', 'bokene', 'husen', 'huser', 'søsterene']);
  });

  it('never offer a variant the standard allows beside a key, written down or not', () => {
    // `boka` without `boken` in its variants: `boken` is still right, and a learner who placed it
    // would be fined as a false positive.
    const bok = oneRow('noun', 'ei bok', ['bok', 'boka', 'bøker', 'bøkene']);
    expect(distractors(bok)).not.toContain('boken');
    expect(distractors(bok)).toContain('boker');
    const hus = oneRow('noun', 'et hus', ['hus', 'huset', 'hus', 'husene']);
    expect(distractors(hus)).not.toContain('husa');
    const leve = oneRow('verb', 'å leve', ['å leve', 'lever', 'levde', 'har levd']);
    expect(distractors(leve)).toEqual(['levte', 'har levt']);
    const kaste = oneRow('verb', 'å kaste', ['å kaste', 'kaster', 'kastet', 'har kastet']);
    expect(distractors(kaste)).not.toContain('kasta');
  });

  it('write a shared letter once at the seam, and drop what spells no word', () => {
    const eple = oneRow('noun', 'et eple', ['eple', 'eplet', 'epler', 'eplene']);
    expect(distractors(eple)).toEqual(['eplen', 'eplerne']);
    const laerer = oneRow('noun', 'en lærer', ['lærer', 'læreren', 'lærere', 'lærerne']);
    for (const d of distractors(laerer)) expect(d).not.toMatch(/erer/);
    const kaste = oneRow('verb', 'å kaste', ['å kaste', 'kaster', 'kastet', 'har kastet']);
    expect(distractors(kaste)).toEqual(['kastde']);
  });

  it('regularise the irregular — the errors a learner actually makes', () => {
    const skrive = oneRow('verb', 'å skrive', ['å skrive', 'skriver', 'skrev', 'har skrevet']);
    expect(distractors(skrive)).toEqual(['skrivet', 'har skrivet', 'skrivte', 'har skrivt', 'skrivde']);
    const god = oneRow('adj', 'god', ['god', 'bedre', 'best']);
    expect(distractors(god)).toEqual(['godere', 'godest', 'mer god', 'mest god']);
  });

  it('offer no nynorsk to a bokmål learner', () => {
    const fin = oneRow('adj', 'fin', ['fin', 'finere', 'finest']);
    expect(distractors(fin)).toEqual(['mer fin', 'mest fin']);
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
