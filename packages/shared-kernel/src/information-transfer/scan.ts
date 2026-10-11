// «Lift from the source» — the fact finder of step 2 (`infScanSource`).
//
// Times, dates, amounts, phone numbers and numbered places the builder can see in the text or
// the transcript. Inserting one creates a field with the type and the expected value already
// set; the author still writes the label and the explanation. The patterns are built from the
// pack — the prototype's were Norwegian regular expressions in code (plan 73 §4.2, 4). Without a
// pack only a digital clock time is found.
//
// One correction to the prototype: a numbered place («rom 204») is inserted as its number. The
// prototype inserted «rom 204» as the expected value of a *Number* field, which its own
// normaliser cannot read — the scanner's first suggestion was a blocker.

import { normText } from './formats.js';
import type { FieldType, InformationTransferContent } from './model.js';
import { packOf, sourceText } from './derive.js';

export interface ScanHit {
  type: FieldType;
  /** As it stands in the source. */
  raw: string;
  /** What goes into the new field's expected value. */
  value: string;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function alternation(words: readonly string[]): string {
  const keys = [...new Set(words.map((w) => w.toLowerCase()).filter((w) => w !== ''))];
  keys.sort((a, b) => b.length - a.length);
  return keys.map(escapeRegExp).join('|');
}

const NOT_LETTER = '(?!\\p{L})';

export function scanSource(
  ex: Pick<InformationTransferContent, 'sourceKind' | 'passage' | 'audio' | 'language'>,
): ScanHit[] {
  const text = sourceText(ex);
  const pack = packOf(ex);
  const hits: ScanHit[] = [];
  const seen = new Set<string>();
  const add = (type: FieldType, raw: string, value = raw.trim()): void => {
    const key = `${type}|${raw.trim().toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ type, raw: raw.trim(), value });
  };
  const run = (pattern: string, type: FieldType, group?: number): void => {
    if (pattern === '') return;
    const re = new RegExp(pattern, 'giu');
    for (const m of text.matchAll(re)) {
      add(type, m[0], group === undefined ? m[0].trim() : (m[group] ?? m[0]).trim());
    }
  };

  if (!pack) {
    run('\\b\\d{1,2}:\\d{2}\\b', 'time');
    return hits;
  }

  const clock = alternation(pack.clock);
  if (clock !== '') run(`(?:${clock})\\s?\\d{1,2}(?:[.:]\\d{2})?`, 'time');
  const toTwelve = Object.entries(pack.numbers)
    .filter(([, v]) => v >= 1 && v <= 12)
    .map(([w]) => w);
  if (pack.half !== '' && toTwelve.length > 0) {
    run(`${escapeRegExp(pack.half)}\\s(?:${alternation(toTwelve)})${NOT_LETTER}`, 'time');
  }
  const months = alternation(pack.months);
  if (months !== '') run(`\\b\\d{1,2}${pack.dayDot ? '\\.' : ''}\\s?(?:${months})${NOT_LETTER}`, 'date');
  // A day said as an ordinal — «tirsdag femte mai» in a recording is written «5. mai» nowhere.
  const ordinals = alternation(Object.keys(pack.ordinals));
  if (months !== '' && ordinals !== '') {
    run(`(?<!\\p{L})(?:${ordinals})\\s(?:${months})${NOT_LETTER}`, 'date');
  }
  const groups = pack.phone.groups.map((n) => `\\d{${n}}`).join('\\s');
  if (groups !== '') run(`\\b${groups}\\b`, 'phone');
  const currency = alternation(pack.currency.filter((c) => /^\p{L}+$/u.test(c)));
  if (currency !== '') run(`\\b\\d+\\s?(?:${currency})${NOT_LETTER}`, 'money');
  // An amount said in words — «fire hundre og femti kroner». Only a run of numerals (with the
  // pack's joiners) that ends at a currency word counts, so «en» and «to» elsewhere stay prose.
  const numerals = alternation(Object.keys(pack.numbers));
  const joiners = alternation(pack.and);
  if (currency !== '' && numerals !== '') {
    const word = joiners === '' ? `(?:${numerals})` : `(?:${numerals}|${joiners})`;
    run(`(?<!\\p{L})(?:${numerals})(?:\\s${word})*\\s(?:${currency})${NOT_LETTER}`, 'money');
  }
  const cues = alternation(pack.scanNumberCues);
  if (cues !== '') run(`\\b(?:${cues})\\s(\\d{1,4})\\b`, 'number', 1);
  return hits;
}

/** Already a field: some field expects this value (normalised), so the hit is greyed out. */
export function isAlreadyAField(
  ex: Pick<InformationTransferContent, 'fields'>,
  hit: ScanHit,
): boolean {
  const value = normText(hit.value);
  return ex.fields.some((f) => f.expected.some((e) => normText(e) === value));
}
