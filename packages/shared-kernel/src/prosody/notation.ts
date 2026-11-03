// The written form of a prosody layer — for seeds and course Markdown (§4a, decision 6).
//
//   ^'1Anna       phrase accent (`^`), then stress: `'1` / `'2` before the stressed syllable,
//                 a bare `'` at the start of a stressed monosyllable (`'bor`)
//   \  /  ~       end of a group — fall, rise, level
//   |  ||         pause — short, long
//   _             the word runs into the next one
//
//   «Jeg '1heter ^'1Anna \ | og jeg '2snakker _ litt 'norsk \ ||»
//
// Rules that keep the text recoverable — without its marks the notation is the text, character
// for character (`checkProsodyNotation`):
//   · `^`, `'1`, `'2` and a bare `'` sit inside a word, before a letter. `'1` / `'2` may stand
//     anywhere in the word; a bare `'` only at its start, because `don't` is a word.
//   · `/ \ ~ | || _` are words of their own, after a space or a tab, and belong to the word
//     before them. Removing one removes the space in front of it. Never in a word: `C#/.NET`
//     and `snake_case` stay text.
//
// Known limits, accepted: a text with an ASCII quote opening a word (`'hei'`) or a lone `/`
// between words does not survive a round trip — the validator reports the mismatch. Norwegian
// course texts quote with «». Vowel length is not written; a word marked here gets it from the
// lexicon when the layers are merged, or stays unknown.

import { tokenize } from '../text/words.js';
import type { Token } from '../text/words.js';
import type {
  GroupBoundary,
  GroupPause,
  GroupPitch,
  PhraseAccent,
  PhraseSource,
  ProsodyKind,
  ProsodyLayer,
  Toneme,
  WordLink,
  WordStress,
} from './model.js';
import { emptyProsodyLayer } from './model.js';
import { stressedVowelFrom, syllableStart } from './spelling.js';

/** Notation problems. `at` is an offset into the notation, `textAt` into the text. */
export type NotationIssue =
  | { code: 'PN_MARKER_NO_WORD'; at: number; marker: string }
  | { code: 'PN_MARKER_AT_LINE_START'; at: number; marker: string }
  | { code: 'PN_LINK_AT_END'; at: number }
  | { code: 'PN_STRESS_NO_VOWEL'; at: number; word: string }
  | { code: 'PN_DUPLICATE'; at: number; kind: ProsodyKind | 'pitch' | 'pause' }
  | { code: 'PN_LINK_WITH_BOUNDARY'; at: number }
  | { code: 'PN_TEXT_MISMATCH'; textAt: number };

export interface ParsedNotation {
  /** The notation without its marks. */
  text: string;
  layer: ProsodyLayer;
  issues: NotationIssue[];
}

type Standalone = { pitch: GroupPitch } | { pause: GroupPause } | { link: true };

const STANDALONE: Readonly<Record<string, Standalone>> = {
  '/': { pitch: 'rise' },
  '\\': { pitch: 'fall' },
  '~': { pitch: 'level' },
  '|': { pause: 'short' },
  '||': { pause: 'long' },
  _: { link: true },
};

const PITCH_SIGN: Readonly<Record<GroupPitch, string>> = { rise: '/', fall: '\\', level: '~' };
const PAUSE_SIGN: Readonly<Record<GroupPause, string>> = { short: '|', long: '||' };

const isLetter = (ch: string | undefined) => ch !== undefined && /\p{L}/u.test(ch);
const isWordChar = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
const isSpace = (ch: string | undefined) => ch !== undefined && /\s/.test(ch);

/** A mark found by the scan, at an offset into the text being rebuilt. */
type Found =
  | { type: 'accent'; pos: number; at: number }
  | { type: 'stress'; pos: number; at: number; toneme: Toneme | null }
  | { type: 'standalone'; pos: number; at: number; marker: string; sign: Standalone };

export function parseProsodyNotation(
  notation: string,
  source: PhraseSource = 'teacher',
): ParsedNotation {
  const issues: NotationIssue[] = [];
  const found: Found[] = [];
  let text = '';

  for (let k = 0; k < notation.length; ) {
    const ch = notation[k];
    const prevText = text[text.length - 1];

    if (ch !== undefined && '/\\~|_'.includes(ch) && (k === 0 || isSpace(notation[k - 1]))) {
      let j = k;
      while (j < notation.length && !isSpace(notation[j])) j++;
      const marker = notation.slice(k, j);
      const sign = STANDALONE[marker];
      if (sign) {
        const before = notation[k - 1];
        if (before === ' ' || before === '\t') {
          text = text.slice(0, -1);
          found.push({ type: 'standalone', pos: text.length, at: k, marker, sign });
        } else {
          issues.push({ code: 'PN_MARKER_AT_LINE_START', at: k, marker });
        }
        k = j;
        continue;
      }
    }

    if (ch === '^' && !isWordChar(prevText) && startsStressOrLetter(notation, k + 1)) {
      found.push({ type: 'accent', pos: text.length, at: k });
      k += 1;
      continue;
    }

    if (ch === "'") {
      const digit = notation[k + 1];
      if ((digit === '1' || digit === '2') && isLetter(notation[k + 2])) {
        found.push({ type: 'stress', pos: text.length, at: k, toneme: digit === '1' ? 1 : 2 });
        k += 2;
        continue;
      }
      if (isLetter(digit) && !isWordChar(prevText)) {
        found.push({ type: 'stress', pos: text.length, at: k, toneme: null });
        k += 1;
        continue;
      }
    }

    text += ch;
    k += 1;
  }

  const tokens = tokenize(text);
  const layer = emptyProsodyLayer();
  const stressed = new Set<number>();
  const accented = new Set<number>();
  const boundaries = new Map<number, GroupBoundary & { at: number }>();
  const links = new Map<number, WordLink & { at: number }>();

  for (const f of found) {
    if (f.type === 'accent' || f.type === 'stress') {
      // The scan put an inline mark only before a letter, so a token is always under it.
      const t = tokenAt(tokens, f.pos);
      if (!t) continue;
      if (f.type === 'accent') {
        if (accented.has(t.i)) issues.push({ code: 'PN_DUPLICATE', at: f.at, kind: 'accent' });
        else {
          accented.add(t.i);
          layer.accents.push({ i: t.i, w: t.w, source } satisfies PhraseAccent);
        }
        continue;
      }
      const vowel = stressedVowelFrom(t.w, f.pos - t.s);
      if (!vowel) issues.push({ code: 'PN_STRESS_NO_VOWEL', at: f.at, word: t.w });
      else if (stressed.has(t.i)) issues.push({ code: 'PN_DUPLICATE', at: f.at, kind: 'stress' });
      else {
        stressed.add(t.i);
        layer.stresses.push({
          i: t.i,
          w: t.w,
          toneme: f.toneme,
          vowel,
          source,
        } satisfies WordStress);
      }
      continue;
    }

    const t = tokenBefore(tokens, f.pos);
    if (!t) {
      issues.push({ code: 'PN_MARKER_NO_WORD', at: f.at, marker: f.marker });
      continue;
    }
    if ('link' in f.sign) {
      const next = tokens[t.i + 1];
      if (!next) issues.push({ code: 'PN_LINK_AT_END', at: f.at });
      else if (links.has(t.i)) issues.push({ code: 'PN_DUPLICATE', at: f.at, kind: 'link' });
      else links.set(t.i, { i: t.i, w: `${t.w} ${next.w}`, source, at: f.at });
      continue;
    }
    const b = boundaries.get(t.i) ?? { i: t.i, w: t.w, pitch: null, pause: null, source, at: f.at };
    if ('pitch' in f.sign) {
      if (b.pitch) issues.push({ code: 'PN_DUPLICATE', at: f.at, kind: 'pitch' });
      else b.pitch = f.sign.pitch;
    } else {
      if (b.pause) issues.push({ code: 'PN_DUPLICATE', at: f.at, kind: 'pause' });
      else b.pause = f.sign.pause;
    }
    boundaries.set(t.i, b);
  }

  for (const [i, link] of links) {
    if (boundaries.has(i)) issues.push({ code: 'PN_LINK_WITH_BOUNDARY', at: link.at });
    const { at: _at, ...mark } = link;
    layer.links.push(mark);
  }
  for (const { at: _at, ...mark } of boundaries.values()) layer.boundaries.push(mark);

  const byToken = (a: { i: number }, b: { i: number }) => a.i - b.i;
  layer.stresses.sort(byToken);
  layer.accents.sort(byToken);
  layer.boundaries.sort(byToken);
  layer.links.sort(byToken);
  return { text, layer, issues };
}

/**
 * The notation of a layer over its text. Marks are written for whatever the layer holds — pass
 * only the authored part for a seed, or a merged layer to show everything.
 *
 * `dropped` counts marks that cannot be written: an anchor that is not on its word any more,
 * and a group end or link after a word with no space behind it (`ord.Neste`). The layer can
 * still draw them; only the notation has no room.
 */
export function toProsodyNotation(
  text: string,
  layer: ProsodyLayer,
): { notation: string; dropped: number } {
  const tokens = tokenize(text);
  const inserts: { pos: number; order: number; str: string }[] = [];
  let dropped = 0;

  const onWord = (i: number, w: string): Token | null => {
    const t = tokens[i];
    return t && t.w.toLowerCase() === w.split(/\s+/)[0]?.toLowerCase() ? t : null;
  };

  for (const a of layer.accents) {
    const t = onWord(a.i, a.w);
    if (t) inserts.push({ pos: t.s, order: 0, str: '^' });
    else dropped++;
  }
  for (const s of layer.stresses) {
    const t = onWord(s.i, s.w);
    if (!t) {
      dropped++;
      continue;
    }
    if (s.toneme === null) inserts.push({ pos: t.s, order: 1, str: "'" });
    else inserts.push({ pos: t.s + syllableStart(t.w, s.vowel.s), order: 1, str: `'${s.toneme}` });
  }

  const gapAfter = (t: Token): number | null => {
    const next = tokens[t.i + 1];
    let g = t.e;
    while (g < text.length && !isSpace(text[g]) && (!next || g < next.s)) g++;
    return g === text.length || isSpace(text[g]) ? g : null;
  };

  for (const b of layer.boundaries) {
    const t = onWord(b.i, b.w);
    const g = t ? gapAfter(t) : null;
    if (g === null) {
      dropped++;
      continue;
    }
    if (b.pitch) inserts.push({ pos: g, order: 2, str: ` ${PITCH_SIGN[b.pitch]}` });
    if (b.pause) inserts.push({ pos: g, order: 3, str: ` ${PAUSE_SIGN[b.pause]}` });
  }
  for (const l of layer.links) {
    const t = onWord(l.i, l.w);
    const g = t ? gapAfter(t) : null;
    if (g === null) dropped++;
    else inserts.push({ pos: g, order: 4, str: ' _' });
  }

  inserts.sort((a, b) => a.pos - b.pos || a.order - b.order);
  let out = '';
  let from = 0;
  for (const ins of inserts) {
    out += text.slice(from, ins.pos) + ins.str;
    from = ins.pos;
  }
  return { notation: out + text.slice(from), dropped };
}

/**
 * Parse a notation written for `text` and say whether it is that text. `PN_TEXT_MISMATCH`
 * names the first character where they part — usually a mark in the wrong place or a text that
 * changed under the notation.
 */
export function checkProsodyNotation(
  text: string,
  notation: string,
  source: PhraseSource = 'teacher',
): ParsedNotation {
  const parsed = parseProsodyNotation(notation, source);
  if (parsed.text !== text) {
    let at = 0;
    while (at < text.length && text[at] === parsed.text[at]) at++;
    parsed.issues.push({ code: 'PN_TEXT_MISMATCH', textAt: at });
  }
  return parsed;
}

// ── internals ───────────────────────────────────────────────────────────────

function startsStressOrLetter(notation: string, k: number): boolean {
  if (isLetter(notation[k])) return true;
  if (notation[k] !== "'") return false;
  const next = notation[k + 1];
  return isLetter(next) || ((next === '1' || next === '2') && isLetter(notation[k + 2]));
}

function tokenAt(tokens: readonly Token[], pos: number): Token | null {
  return tokens.find((t) => t.s <= pos && pos < t.e) ?? null;
}

function tokenBefore(tokens: readonly Token[], pos: number): Token | null {
  let hit: Token | null = null;
  for (const t of tokens) {
    if (t.e > pos) break;
    hit = t;
  }
  return hit;
}
