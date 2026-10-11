// The accepted-forms surface (step 3) and the source scanner (step 2) — sized against the
// prototype's `infVariants` and `infScanSource` run in node (plan 73, phase 1).

import { describe, expect, it } from 'vitest';

import { acceptedForms, numberToWords } from './accepted.js';
import { SAMPLE_FIELD_IDS, sampleContent } from './fixture.js';
import { gradeCell, passes } from './grading.js';
import { DEFAULT_GRADING, newField } from './model.js';
import type { FieldType } from './model.js';
import { packFor } from './packs/index.js';
import { isAlreadyAField, scanSource } from './scan.js';

const nb = packFor('nb');
const formsIn = (pack: typeof nb, type: FieldType, value: string): string[] =>
  acceptedForms({ ...newField('x', type), expected: [value] }, pack);
const forms = (type: FieldType, value: string): string[] => formsIn(nb, type, value);

describe('acceptedForms (INF-M13)', () => {
  it('matches the prototype on the sample', () => {
    expect(sampleContent().fields.map((f) => acceptedForms(f, nb))).toEqual([
      ['3. mars', '3.3', '03.03', 'tredje mars'],
      ['17:30', '17.30', 'kl. 17.30', '1730', 'halv seks'],
      ['204', 'tohundre og fire'],
      ['450', '450 kr', '450,-', 'firehundre og femti'],
      ['22456789', '22 45 67 89', '+47 22456789'],
      ['Anne Lise Berg', 'anne lise berg', 'Anne Lise Berg.'],
    ]);
  });

  it('a whole hour, a quarter past, a day with an ordinal', () => {
    expect(forms('time', '09:00')).toEqual(['09:00', '9.00', 'kl. 9.00', '900', 'klokka ni']);
    expect(forms('time', '14:15')).toEqual(['14:15', '14.15', 'kl. 14.15', '1415', 'kvart over to']);
    expect(forms('date', '17. mai')).toEqual(['17. mai', '17.5', '17.05', 'syttende mai']);
    expect(forms('money', '1250')).toEqual(['1250', '1250 kr', '1250,-']);
    expect(forms('number', '7')).toEqual(['7', 'sju']);
  });

  it('every form passes its own cell', () => {
    for (const f of sampleContent().fields) {
      for (const v of acceptedForms(f, nb)) {
        expect(passes(gradeCell(f, v, DEFAULT_GRADING, nb).verdict), `${f.label}: ${v}`).toBe(true);
      }
    }
  });

  it('nothing for a key the core cannot read', () => expect(forms('number', 'halv fire')).toEqual([]));

  it('digits only without a pack', () => {
    expect(formsIn(undefined, 'time', '17:30')).toEqual(['17:30']);
    expect(formsIn(undefined, 'date', '03.03')).toEqual(['03.03']);
  });

  it('numbers in words', () => {
    expect(numberToWords(25, nb!)).toBe('tjuefem');
    expect(numberToWords(204, nb!)).toBe('tohundre og fire');
    expect(numberToWords(1250, nb!)).toBeNull();
  });
});

describe('scanSource (INF-M14)', () => {
  it('lifts the facts out of the transcript', () => {
    expect(scanSource(sampleContent('audio'))).toEqual([
      { type: 'time', raw: 'halv seks', value: 'halv seks' },
      { type: 'date', raw: '3. mars', value: '3. mars' },
      { type: 'phone', raw: '22 45 67 89', value: '22 45 67 89' },
      { type: 'money', raw: '450 kroner', value: '450 kroner' },
      // A numbered place is inserted as its number — the prototype inserted «rom 204», which a
      // *Number* field cannot read (plan 73 §4.2).
      { type: 'number', raw: 'rom 204', value: '204' },
    ]);
  });

  it('lifts the facts out of the text', () => {
    expect(scanSource(sampleContent('text')).map((h) => [h.type, h.value])).toEqual([
      ['time', 'kl. 17.30'],
      ['time', 'kl. 18.00'],
      ['date', '28. februar'],
      ['phone', '22 45 67 89'],
      ['money', '450 kr'],
      ['number', '204'],
      ['number', '108'],
    ]);
  });

  it('lifts a day and an amount that are only said in words', () => {
    const ex = {
      ...sampleContent('audio'),
      language: 'nb',
      passage: '',
      audio: {
        ...sampleContent('audio').audio,
        transcript:
          'Kurset starter tirsdag femte mai klokken halv seks. Det koster fire hundre og femti kroner. Vi har to timer og en pause.',
      },
    };
    const hits = scanSource(ex).map((h) => [h.type, h.value]);
    expect(hits).toEqual([
      ['time', 'halv seks'],
      ['date', 'femte mai'],
      ['money', 'fire hundre og femti kroner'],
    ]);
  });

  it('a spelled hit is readable as its own type', () => {
    for (const [type, value] of [
      ['date', 'femte mai'],
      ['money', 'fire hundre og femti kroner'],
    ] as const) {
      const f = { ...newField('x', type), expected: [value] };
      expect(gradeCell(f, value, DEFAULT_GRADING, nb).verdict, value).toBe('ok');
    }
  });

  it('every hit is readable as its own type', () => {
    for (const h of scanSource(sampleContent('text'))) {
      const f = { ...newField('x', h.type), expected: [h.value] };
      expect(gradeCell(f, h.value, DEFAULT_GRADING, nb).verdict, h.raw).toBe('ok');
    }
  });

  it('knows which are already fields', () => {
    const ex = sampleContent('text');
    const hits = scanSource(ex);
    expect(hits.filter((h) => isAlreadyAField(ex, h)).map((h) => h.value)).toEqual(['22 45 67 89', '204']);
  });

  it('only a digital clock without a pack', () => {
    const ex = { ...sampleContent('text'), language: 'uk', passage: 'Початок о 17:30, кімната 204.' };
    expect(scanSource(ex)).toEqual([{ type: 'time', raw: '17:30', value: '17:30' }]);
  });

  it('nothing to lift from an empty source', () => {
    expect(scanSource({ ...sampleContent('text'), passage: '' })).toEqual([]);
  });
});

describe('the sample ids are stable', () => {
  it('six fields', () => expect(sampleContent().fields.map((f) => f.id)).toEqual([...SAMPLE_FIELD_IDS]));
});
