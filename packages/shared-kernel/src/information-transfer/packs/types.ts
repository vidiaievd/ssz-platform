// The shape of a language pack for `information_transfer` (plan 73 §3.3; DECISIONS §1).
//
// Everything a normaliser, the accepted-forms generator or the source scanner needs to know about
// one language lives here as data: the clock words, the numeral lexicon, the months, the currency,
// how phone numbers are written. The code in `formats.ts`, `accepted.ts` and `scan.ts` reads the
// pack and knows nothing about Norwegian — the handoff's whole argument for putting format rules in
// the core rather than in each exercise.

import type { FieldType } from '../model.js';

/**
 * The notations the accepted-forms surface of step 3 shows, as templates over a canonical value.
 * A template whose token cannot be filled (no word for the number, no ordinal for the day) is
 * skipped. Tokens:
 *
 *   time   {HH} {H} {MM} — the canonical hour padded, unpadded, and the minutes
 *          {hour} — the hour on a 12-hour clock in words; {next} — the next hour in words
 *   date   {d} {DD} {m} {MM} {month} {ordinal}
 *   number {n} {words}
 *   phone  {digits} {groups}
 */
export interface AcceptedTemplates {
  time: string[];
  /** Only for a whole hour: «klokka ni». */
  timeWholeHour: string[];
  /** Only for half past: «halv seks» is 17:30. */
  timeHalf: string[];
  /** Only for quarter past: «kvart over to». */
  timeQuarterPast: string[];
  date: string[];
  number: string[];
  money: string[];
  phone: string[];
}

/** Content-language strings the builder shows as placeholders. */
export interface PackPlaceholders {
  title: string;
  instruction: string;
  passageTitle: string;
  passage: string;
  formTitle: string;
  label: string;
  unit: string;
  why: string;
  hint: string;
  /** The first expected wording, per field type: «17:30», «3. mars». */
  expected: Record<FieldType, string>;
}

export interface FormatPack {
  /** The base language code: `nb`. */
  language: string;
  /** In the builder's select: «Norsk (bokmål)». */
  label: string;
  /** Words that may stand before a clock time: «kl.», «klokka». */
  clock: string[];
  /** «halv» — half *to* the next hour: «halv seks» is 5:30. */
  half: string;
  /** «kvart». */
  quarter: string[];
  /** «over» — minutes past. */
  over: string;
  /** «på» — minutes to. */
  to: string;
  /** Joiners skipped inside a spelled-out numeral: «to hundre **og** fire». */
  and: string[];
  /** Twelve month names, January first, in the form a date takes. */
  months: string[];
  /** The numeral lexicon. 100 and 1000 are the multipliers. */
  numbers: Record<string, number>;
  ordinals: Record<string, number>;
  /** Currency words and signs, stripped from an amount: «kr», «kroner», «,-». */
  currency: string[];
  phone: {
    /** Country codes without `+` or `00`: a number may be written with them. */
    countryCodes: string[];
    /** Digits of a national number — the country code is dropped only before exactly this many. */
    length: number;
    /** How a number is grouped in print, for the scanner and the generator: 22 45 67 89. */
    groups: number[];
  };
  /** A day of the month is written with a full stop: «3. mars». */
  dayDot: boolean;
  accepted: AcceptedTemplates;
  /** What the student sees in an empty cell: «kl.», «dag og måned». */
  cellPlaceholders: Partial<Record<FieldType, string>>;
  /** Words the scanner reads a plain number after: «rom 204». */
  scanNumberCues: string[];
  placeholders: PackPlaceholders;
}
