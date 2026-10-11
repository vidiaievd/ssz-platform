// Format normalisers — DECISIONS §1: «rules in the core, keyed on the field type».
//
// The author names the fact once («17:30», typed *Time*); every notation of that fact is turned
// into the same canonical value before anything is compared, so `kl. 17.30`, `1730` and
// `halv seks` are one answer. Formats, unlike meaning, are a closed problem — clock, date,
// count, amount, phone number — and each field type owns one normaliser here.
//
// Every normaliser returns an **array** of canonical candidates: «to» as a clock time is both
// 02:00 and 14:00, and a student who writes either has heard the announcement. An empty array
// means "not readable as this type" — the `unread` verdict (grading.ts).
//
// This is the prototype's `infCanon` family, ported by behaviour (plan 73 §4.2):
//
//   * every word of a language comes from the pack (`packs/`) — the prototype kept the numeral
//     joiner, «hundre», the country code and a Latin-plus-Cyrillic alphabet in code;
//   * a currency word is stripped as a word, not as a substring — the prototype's `split("kr")`
//     cut «kroner» into «oner» and read «450 kroner» as no amount at all;
//   * without a pack only digits are read (decision Q2-A): no Norwegian is lent to another course.
//
// The text path is short_answer's: the same Levenshtein-1 (`grading.ts` imports it from
// `short-answer/matching.ts`). The normalisation below is this type's own — it also strips
// `[ ] / \` and the backtick, without which «3/3» is not a date, and changing short_answer's
// `normalize` would move that type's verdicts (plan 73 §3.4, deviation 7).

import type { FieldType, Grading } from './model.js';
import { isFormatType } from './model.js';
import type { FormatPack } from './packs/index.js';

/** Lowercase, NFC, punctuation to spaces, whitespace collapsed (`infNormText`). */
export function normText(text: string): string {
  return String(text ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[«»"'`´.,;:!?()[\]\-–—/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Pack words as one alternation, longest first so «kroner» is tried before «kr». */
function alternation(words: readonly string[]): string {
  const keys = [...new Set(words.map(normText).filter((w) => w !== ''))];
  keys.sort((a, b) => b.length - a.length);
  return keys.map(escapeRegExp).join('|');
}

/** «tjuefem» → [20, 5], «tohundre» → [2, 100]; a word of the lexicon → itself. */
function splitNumber(word: string, lexicon: Readonly<Record<string, number>>): number[] | null {
  const direct = lexicon[word];
  if (direct !== undefined) return [direct];
  for (const [key, value] of Object.entries(lexicon)) {
    if (word.length <= key.length || !word.startsWith(key)) continue;
    const rest = lexicon[word.slice(key.length)];
    if (rest === undefined) continue;
    if (value >= 20 && value <= 90 && value % 10 === 0 && rest < 10) return [value, rest];
    if (value < 20 && (rest === 100 || rest === 1000)) return [value, rest];
  }
  return null;
}

/** Spelled-out numerals: «to hundre og femti» → 250 (`infWordsToNum`). Digits pass through. */
export function wordsToNumber(text: string, pack: FormatPack | undefined): number | null {
  const tokens = normText(text).split(' ').filter(Boolean);
  if (tokens.length === 0) return null;
  const joiners = new Set((pack?.and ?? []).map(normText));
  const lexicon = pack?.numbers ?? {};

  let total = 0;
  let current = 0;
  let any = false;
  for (const token of tokens) {
    if (joiners.has(token)) continue;
    if (/^\d+$/.test(token)) {
      current += parseInt(token, 10);
      any = true;
      continue;
    }
    const parts = splitNumber(token, lexicon);
    if (parts === null) return null;
    for (const n of parts) {
      any = true;
      if (n === 100 || n === 1000) {
        current = (current || 1) * n;
        if (n === 1000) {
          total += current;
          current = 0;
        }
      } else {
        current += n;
      }
    }
  }
  return any ? total + current : null;
}

function hhmm(h: number, m: number): string {
  return `${String(((h % 24) + 24) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Both readings of an hour under twelve — the clock of an announcement is ambiguous. */
function hourCandidates(h: number, m: number): string[] {
  return h < 12 ? [hhmm(h, m), hhmm(h + 12, m)] : [hhmm(h, m)];
}

/** Clock time → `["HH:MM", …]`: digits, the pack's clock words, half, quarter, «ti over to». */
export function timeCandidates(raw: string, pack: FormatPack | undefined): string[] {
  let s = normText(raw);
  if (s === '') return [];
  for (const word of pack?.clock ?? []) {
    const k = normText(word);
    if (k === '') continue;
    if (s.startsWith(`${k} `)) s = s.slice(k.length + 1).trim();
    else if (s === k) s = '';
  }

  let m = s.match(/^(\d{1,2})[:\s](\d{2})$/);
  if (m) return [hhmm(Number(m[1]), Number(m[2]))];
  m = s.match(/^(\d{1,2})(\d{2})$/);
  if (m && Number(m[1]) <= 24 && Number(m[2]) < 60) return [hhmm(Number(m[1]), Number(m[2]))];
  m = s.match(/^(\d{1,2})$/);
  if (m && Number(m[1]) <= 24) return hourCandidates(Number(m[1]), 0);
  if (!pack) return [];

  const half = escapeRegExp(normText(pack.half));
  const over = normText(pack.over);
  const to = normText(pack.to);
  const ways = `${escapeRegExp(over)}|${escapeRegExp(to)}`;

  m = s.match(new RegExp(`^${half} (.+)$`, 'u'));
  if (m) {
    const h = wordsToNumber(m[1] ?? '', pack);
    if (h !== null) return hourCandidates((h + 23) % 24, 30);
  }
  m = s.match(new RegExp(`^(?:${alternation(pack.quarter)}) (${ways}) (.+)$`, 'u'));
  if (m) {
    const h = wordsToNumber(m[2] ?? '', pack);
    if (h !== null) {
      return m[1] === over ? hourCandidates(h, 15) : hourCandidates((h + 23) % 24, 45);
    }
  }
  m = s.match(new RegExp(`^(.+) (${ways}) (.+)$`, 'u'));
  if (m) {
    const minutes = wordsToNumber(m[1] ?? '', pack);
    const h = wordsToNumber(m[3] ?? '', pack);
    if (minutes !== null && h !== null && minutes < 60) {
      return m[2] === over
        ? hourCandidates(h, minutes)
        : hourCandidates((h + 23) % 24, 60 - minutes);
    }
  }
  const bare = wordsToNumber(s, pack);
  return bare !== null && bare <= 24 ? hourCandidates(bare, 0) : [];
}

function mmdd(month: number, day: number): string {
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Date → `["MM-DD"]`. The year is dropped: an announcement rarely says one. */
export function dateCandidates(raw: string, pack: FormatPack | undefined): string[] {
  const s = normText(raw);
  if (s === '') return [];
  let m = s.match(/^(\d{1,2})[ .](\d{1,2})(?:[ .]\d{2,4})?$/);
  if (m && Number(m[1]) <= 31 && Number(m[2]) <= 12) return [mmdd(Number(m[2]), Number(m[1]))];
  if (!pack) return [];

  m = s.match(/^(\d{1,2}) (\p{L}+)(?: \d{2,4})?$/u) ?? s.match(/^(\p{L}+) (\p{L}+)$/u);
  if (m) {
    const dayWord = m[1] ?? '';
    const day = /^\d+$/.test(dayWord)
      ? parseInt(dayWord, 10)
      : (pack.ordinals[dayWord] ?? wordsToNumber(dayWord, pack));
    const month = pack.months.map(normText).indexOf(m[2] ?? '');
    if (day && day <= 31 && month > -1) return [mmdd(month + 1, day)];
  }
  return [];
}

/** A count or a room number: digits (thousands may be spaced) or words. */
export function numberCandidates(raw: string, pack: FormatPack | undefined): string[] {
  const s = normText(raw).replace(/\s(?=\d{3}\b)/g, '');
  if (/^\d+$/.test(s)) return [String(parseInt(s, 10))];
  const n = wordsToNumber(s, pack);
  return n === null ? [] : [String(n)];
}

/** An amount with or without the currency: «450», «450 kr», «450,-», «fire hundre og femti». */
export function moneyCandidates(raw: string, pack: FormatPack | undefined): string[] {
  let s = normText(raw);
  const currency = alternation(pack?.currency ?? []);
  if (currency !== '') {
    // As a word, or glued to the digits («450kr») — never out of the middle of another word.
    s = s.replace(new RegExp(`(?<!\\p{L})(?:${currency})(?!\\p{L})`, 'gu'), ' ');
  }
  return numberCandidates(s.replace(/\s+/g, ' ').trim(), pack);
}

/** Digits only: grouping, `+` and the pack's country code are not the fact. */
export function phoneCandidates(raw: string, pack: FormatPack | undefined): string[] {
  let d = String(raw ?? '').replace(/[^\d]/g, '');
  for (const code of pack?.phone.countryCodes ?? []) {
    if (d.startsWith(`00${code}`)) d = d.slice(code.length + 2);
    if (d.startsWith(code) && d.length === code.length + (pack?.phone.length ?? 0)) {
      d = d.slice(code.length);
    }
  }
  return d.length >= 5 ? [d] : [];
}

/**
 * One entry point (`infCanon`). With spelled-out numerals switched off, a format value carrying no
 * digit at all is simply not read — «halv seks» stops being a way of writing 17:30.
 */
export function canon(
  type: FieldType,
  raw: string,
  pack: FormatPack | undefined,
  grading: Pick<Grading, 'spelledNumbers' | 'strictCase'>,
): string[] {
  if (!grading.spelledNumbers && isFormatType(type) && !/\d/.test(String(raw ?? ''))) return [];
  switch (type) {
    case 'time':
      return timeCandidates(raw, pack);
    case 'date':
      return dateCandidates(raw, pack);
    case 'number':
      return numberCandidates(raw, pack);
    case 'money':
      return moneyCandidates(raw, pack);
    case 'phone':
      return phoneCandidates(raw, pack);
    default: {
      const text = grading.strictCase ? String(raw ?? '').normalize('NFC').trim() : normText(raw);
      return text === '' ? [] : [text];
    }
  }
}
