// Narration script — what a speech synthesizer reads aloud from a lesson body (plan 74).
//
// The body is the `body_markdown` of a lesson variant: headings, paragraphs, dialogue turns
// written as `**Silje:** …`, block quotes standing for documents (a job ad, a pull request),
// lists, the odd table, and media tokens. A synthesizer must hear none of that markup, and
// per decision D2 it must not hear the speakers' names either.
//
// The script is shared because two sides must agree on it: media-service synthesizes from it,
// and the web editor recomputes `textHash` from the current body to tell the author the
// narration is out of date. A hash that differed by one stripping rule between the two would
// flag every lesson as stale.

import { sha256Hex } from './sha256.js';

/**
 * Bumped whenever a rule below changes what is read aloud. It is part of `textHash`, so a
 * new rule marks the narrations made under the old one as stale — which they are: the audio
 * no longer matches what the script would produce.
 */
export const NARRATION_SCRIPT_VERSION = 1;

export type NarrationSegmentKind = 'paragraph' | 'turn' | 'heading';

export interface NarrationSegment {
  kind: NarrationSegmentKind;
  /**
   * Who says a `turn` (`"Silje"` for `**Silje:** …`); null for narration, headings and
   * dash-introduced turns. Never part of `text` — it only selects a voice.
   */
  speaker: string | null;
  /** Plain text, one line, no markup. Never empty. */
  text: string;
}

export interface NarrationScript {
  lang: string;
  segments: NarrationSegment[];
  /** Lowercase hex sha256 over the version, the language and the segments. */
  textHash: string;
}

/** Silence between two consecutive dialogue turns (D2). */
export const NARRATION_TURN_PAUSE_MS = 600;
/** Silence between any other two segments: paragraphs, headings, a turn and narration (D2). */
export const NARRATION_PARAGRAPH_PAUSE_MS = 900;

/** Silence the synthesizer inserts between `previous` and `next`. */
export function narrationPauseMs(previous: NarrationSegment, next: NarrationSegment): number {
  return previous.kind === 'turn' && next.kind === 'turn'
    ? NARRATION_TURN_PAUSE_MS
    : NARRATION_PARAGRAPH_PAUSE_MS;
}

// ---------------------------------------------------------------------------
// Media tokens — the same three shapes content-service's MarkdownMediaParserService extracts,
// plus ordinary images and links, whose URL is never read.
// ---------------------------------------------------------------------------

const MEDIA_TOKENS: readonly RegExp[] = [
  /!\[[^\]]*\]\([^)]*\)/g, // ![alt](media://id) and any other image
  /\[audio:[a-zA-Z0-9_-]+(?:\s+"[^"]*")?\]/g,
  /\[video:[a-zA-Z0-9_-]+\]/g,
];
const LINK = /\[([^\]]*)\]\([^)]*\)/g;

// ---------------------------------------------------------------------------
// Line shapes.
// ---------------------------------------------------------------------------

const QUOTE_PREFIX = /^[ \t]*(?:>[ \t]?)+/;
const HEADING = /^[ \t]{0,3}#{1,6}[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const RULE = /^[ \t]*(?:[-*_][ \t]*){3,}$/;
const TABLE_ROW = /^[ \t]*\|/;
const TABLE_DIVIDER = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const LIST_ITEM = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(.*)$/;
const FENCE = /^[ \t]*(?:```|~~~)/;
/** `**Silje:** text` or `**Silje**: text`; `speakerOf` decides whether the label is a name. */
const SPEAKER = /^\*\*([^*\n]{1,80}?)(?::\*\*|\*\*:)[ \t]*(.*)$/;
/** `Silje (etterpå)` — a name followed by a stage direction, which is not read either. */
const STAGE_DIRECTION = /^([^()]*?)[ \t]*\([^()]*\)$/;
/** `– Hei!` — a turn introduced by a dialogue dash. A hyphen is a list item, not a turn. */
const DASH_TURN = /^[ \t]*[–—][ \t]+(.*)$/;
/** A sub-lesson code at the start of a heading: `2A — `, `18B: `. Read as noise, so dropped. */
const SUBLESSON_CODE = /^\d+[ \t]*[A-Za-zÆØÅæøå]?[ \t]*[—–:-][ \t]+(?=\S)/;
const SENTENCE_END = /[.!?…:;][»"”’')\]]*$/;

/**
 * Letters a voice for `lang` cannot read. A Norwegian text carries the occasional Russian
 * gloss in a vocabulary table (`ca., приблизительно`); a Norwegian voice spells it as noise.
 */
function foreignLetter(lang: string): RegExp {
  const base = lang.toLowerCase().split(/[-_]/)[0] ?? '';
  const script = ['ru', 'uk', 'be', 'bg', 'sr', 'mk'].includes(base) ? 'Cyrillic' : 'Latin';
  return new RegExp(`[^\\P{L}\\p{Script=${script}}]`, 'u');
}

/** Inline markdown and symbols out, words in, whitespace collapsed. */
function cleanInline(raw: string, foreign: RegExp): string {
  let text = raw;
  for (const token of MEDIA_TOKENS) text = text.replace(token, ' ');
  text = text
    .replace(LINK, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/(^|[^\p{L}\p{N}*])\*([^*\s][^*]*?)\*(?![\p{L}\p{N}*])/gu, '$1$2')
    .replace(/(^|[^\p{L}\p{N}_])_([^_\s][^_]*?)_(?![\p{L}\p{N}_])/gu, '$1$2')
    .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, '$1')
    .replace(/[*_]{2,}/g, ' ')
    .replace(
      /\p{Extended_Pictographic}[\u{FE0F}\u{200D}\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}]*/gu,
      ' ',
    )
    .replace(/[→⇒➔]/g, ', ');
  text = text
    .split(/\s+/)
    .filter((word) => !foreign.test(word))
    .join(' ');
  return text
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+([,.;:!?…])(?=\s|$)/g, '$1')
    .replace(/([,;:])(?:\s*[,;:])+/g, '$1')
    .replace(/^[\s,;:—–-]+/, '')
    .replace(/[\s,;—–-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ends a list item or a table row as a sentence, so the voice pauses before the next one. */
function asSentence(text: string): string {
  return text.length === 0 || SENTENCE_END.test(text) ? text : `${text}.`;
}

/**
 * The speaker of a `**Name:** text` line, without its stage direction: `**Taras (svar):**`
 * is spoken by `Taras`. Null when the label is not a name — see the checks below.
 */
function speakerOf(line: string): { speaker: string; rest: string } | null {
  const match = SPEAKER.exec(line);
  if (!match) return null;
  const label = match[1]!.trim();
  const speaker = (STAGE_DIRECTION.exec(label)?.[1] ?? label).trim();
  const rest = match[2] ?? '';
  // A name has no sentence punctuation and at most a few words (`Silje Berg`, `En annen leder`).
  if (!speaker || /[.!?…:;«»"()]/.test(speaker) || speaker.split(/\s+/).length > 4) return null;
  // A bold label alone on its line (`**Vi tilbyr:**`) introduces what follows; it is read.
  if (!rest.trim()) return null;
  return { speaker, rest };
}

interface Line {
  text: string;
  quoted: boolean;
}

/**
 * Turn a lesson body into the segments a synthesizer reads.
 *
 * Paragraphs are separated by blank lines (a quoted blank line `>` counts). Inside a
 * paragraph, a line starting with a speaker label or a dialogue dash opens a new turn, and
 * a heading line stands alone. Block quotes represent documents, where a bold label
 * (`**Profil:**`) is content and is read — unless the label names someone who speaks
 * outside the quote in the same body (`> **Ingrid (kommentar):**` in a pull request whose
 * author talks with Ingrid elsewhere): that line is a turn and the name is dropped. Lists
 * and table rows are read as consecutive sentences of one paragraph. Fenced code is skipped.
 */
export function toNarrationScript(bodyMarkdown: string, lang: string): NarrationScript {
  const foreign = foreignLetter(lang);
  const segments: NarrationSegment[] = [];

  let buffer: string[] = [];
  let bufferKind: NarrationSegmentKind = 'paragraph';
  let bufferSpeaker: string | null = null;
  // The list item being read; an indented line that follows continues it.
  let item: string[] | null = null;

  const endItem = () => {
    if (item) buffer.push(asSentence(cleanInline(item.join(' '), foreign)));
    item = null;
  };
  const flush = () => {
    endItem();
    const text = cleanInline(buffer.join(' '), foreign);
    if (text) segments.push({ kind: bufferKind, speaker: bufferSpeaker, text });
    buffer = [];
    bufferKind = 'paragraph';
    bufferSpeaker = null;
  };
  const open = (kind: NarrationSegmentKind, speaker: string | null, text: string) => {
    flush();
    bufferKind = kind;
    bufferSpeaker = speaker;
    buffer.push(text);
  };

  const lines: Line[] = (bodyMarkdown ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((raw) => {
      const quote = QUOTE_PREFIX.exec(raw);
      return quote
        ? { text: raw.slice(quote[0].length), quoted: true }
        : { text: raw, quoted: false };
    });

  // Names that speak outside block quotes; a quoted label naming one of them is a turn.
  const speakers = new Set<string>();
  for (const { text, quoted } of lines) {
    const turn = quoted ? null : speakerOf(text.trim());
    if (turn) speakers.add(turn.speaker);
  }

  let inFence = false;
  for (const { text: line, quoted } of lines) {
    if (FENCE.test(line)) {
      flush();
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (line.trim() === '' || RULE.test(line)) {
      flush();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const text = cleanInline(heading[1]!.replace(SUBLESSON_CODE, ''), foreign);
      if (text) segments.push({ kind: 'heading', speaker: null, text });
      continue;
    }

    if (item && /^[ \t]+\S/.test(line) && !LIST_ITEM.test(line)) {
      item.push(line);
      continue;
    }
    endItem();

    if (TABLE_ROW.test(line)) {
      if (TABLE_DIVIDER.test(line)) continue;
      const cells = line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cleanInline(cell, foreign))
        .filter((cell) => cell.length > 0);
      if (cells.length > 0) buffer.push(asSentence(cells.join(' — ')));
      continue;
    }

    const listItem = LIST_ITEM.exec(line);
    if (listItem) {
      item = [listItem[1]!];
      continue;
    }

    const turn = speakerOf(line.trim());
    if (turn && (!quoted || speakers.has(turn.speaker))) {
      open('turn', turn.speaker, turn.rest);
      continue;
    }
    if (!quoted) {
      const dash = DASH_TURN.exec(line);
      if (dash) {
        open('turn', null, dash[1]!);
        continue;
      }
    }

    buffer.push(line);
  }
  flush();

  return { lang, segments, textHash: narrationTextHash(lang, segments) };
}

/** The hash the editor compares against `synthesis.textHash` on the narration asset. */
export function narrationTextHash(lang: string, segments: readonly NarrationSegment[]): string {
  const canonical = [
    `narration-v${NARRATION_SCRIPT_VERSION}`,
    lang.toLowerCase(),
    ...segments.map((s) => `${s.kind}\t${s.speaker ?? ''}\t${s.text}`),
  ].join('\n');
  return sha256Hex(canonical);
}
