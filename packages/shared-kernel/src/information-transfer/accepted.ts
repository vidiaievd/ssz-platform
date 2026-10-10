// The accepted-forms surface of step 3 — DECISIONS §1: «the author sees the result».
//
// Per cell, the notations the core will accept, generated from the expected value by the same
// normalisers the server runs (`infVariants`). The builder grades every one of them with the real
// grader, so a chip is green (the author's own wording), grey (recognised and counted) or red (the
// key itself is unreadable). Which notations are worth showing is the pack's to say (`accepted`):
// the prototype wrote «kl. », «klokka », «+47 » and «hundre» into this code.

import { expectedOf } from './derive.js';
import {
  dateCandidates,
  moneyCandidates,
  numberCandidates,
  phoneCandidates,
  timeCandidates,
} from './formats.js';
import type { Field } from './model.js';
import type { FormatPack } from './packs/index.js';

/** The first word of the lexicon for each value — the form the generator writes. */
function wordFor(pack: FormatPack): Map<number, string> {
  const out = new Map<number, string>();
  for (const [word, value] of Object.entries(pack.numbers)) if (!out.has(value)) out.set(value, word);
  return out;
}

/** 25 → «tjuefem», 204 → «tohundre og fire» (`infNumToWords`). `null` past 999 or off the lexicon. */
export function numberToWords(n: number, pack: FormatPack): string | null {
  const inv = wordFor(pack);
  const direct = inv.get(n);
  if (direct !== undefined) return direct;
  if (n < 100) {
    const tens = inv.get(Math.floor(n / 10) * 10);
    const unit = inv.get(n % 10);
    return tens !== undefined && unit !== undefined ? tens + unit : null;
  }
  if (n < 1000) {
    const hundred = inv.get(100);
    if (hundred === undefined) return null;
    const head = (inv.get(Math.floor(n / 100)) ?? '') + hundred;
    const rest = n % 100;
    if (rest === 0) return head;
    // The prototype wrote «tohundre og » for a remainder it had no word for; nothing is better.
    const tail = numberToWords(rest, pack);
    if (tail === null) return null;
    const joiner = pack.and[0];
    return joiner === undefined ? `${head} ${tail}` : `${head} ${joiner} ${tail}`;
  }
  return null;
}

/** Fill `{token}`s; a template with a token that has no value is dropped. */
function fill(template: string, tokens: Readonly<Record<string, string | null>>): string | null {
  let missing = false;
  const out = template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = tokens[name];
    if (value === null || value === undefined) {
      missing = true;
      return '';
    }
    return value;
  });
  return missing ? null : out;
}

function grouped(digits: string, groups: readonly number[]): string {
  const parts: string[] = [];
  let at = 0;
  let i = 0;
  const last = groups[groups.length - 1] ?? 2;
  while (at < digits.length) {
    const size = groups[i] ?? last;
    parts.push(digits.slice(at, at + size));
    at += size;
    i += 1;
  }
  return parts.join(' ');
}

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Every notation of the cell's first expected value worth showing the author, in the pack's
 * order. Empty when the core cannot read the value — the chip then says so.
 */
export function acceptedForms(
  field: Pick<Field, 'type' | 'expected'>,
  pack: FormatPack | undefined,
): string[] {
  const exp = expectedOf(field)[0];
  if (exp === undefined) return [];
  const out: string[] = [];
  const push = (s: string | null): void => {
    if (s !== null && s !== '' && !out.includes(s)) out.push(s);
  };
  const apply = (templates: readonly string[], tokens: Record<string, string | null>): void => {
    for (const t of templates) push(fill(t, tokens));
  };
  const words = (n: number): string | null => (pack ? numberToWords(n, pack) : null);

  switch (field.type) {
    case 'time': {
      const c = timeCandidates(exp, pack)[0];
      if (c === undefined) return [];
      const h = parseInt(c.slice(0, 2), 10);
      const m = parseInt(c.slice(3), 10);
      if (!pack) return [c];
      const tokens = {
        HH: c.slice(0, 2),
        H: String(h),
        MM: pad(m),
        hour: words(h > 12 ? h - 12 : h),
        next: words(h + 1 > 12 ? h + 1 - 12 : h + 1),
      };
      apply(pack.accepted.time, tokens);
      if (m === 0) apply(pack.accepted.timeWholeHour, tokens);
      if (m === 30) apply(pack.accepted.timeHalf, tokens);
      if (m === 15) apply(pack.accepted.timeQuarterPast, tokens);
      return out;
    }
    case 'date': {
      const c = dateCandidates(exp, pack)[0];
      if (c === undefined) return [];
      const mo = parseInt(c.slice(0, 2), 10);
      const d = parseInt(c.slice(3), 10);
      if (!pack) return [`${pad(d)}.${pad(mo)}`];
      const ordinal = Object.entries(pack.ordinals).find(([, v]) => v === d)?.[0] ?? null;
      apply(pack.accepted.date, {
        d: String(d),
        DD: pad(d),
        m: String(mo),
        MM: pad(mo),
        month: pack.months[mo - 1] ?? null,
        ordinal,
      });
      return out;
    }
    case 'number':
    case 'money': {
      const c = (field.type === 'money' ? moneyCandidates : numberCandidates)(exp, pack)[0];
      if (c === undefined) return [];
      if (!pack) return [c];
      const templates = field.type === 'money' ? pack.accepted.money : pack.accepted.number;
      apply(templates, { n: c, words: words(parseInt(c, 10)) });
      return out;
    }
    case 'phone': {
      const c = phoneCandidates(exp, pack)[0];
      if (c === undefined) return [];
      if (!pack) return [c];
      apply(pack.accepted.phone, { digits: c, groups: grouped(c, pack.phone.groups) });
      return out;
    }
    default:
      push(exp);
      push(exp.toLowerCase());
      push(`${exp}.`);
      return out;
  }
}
