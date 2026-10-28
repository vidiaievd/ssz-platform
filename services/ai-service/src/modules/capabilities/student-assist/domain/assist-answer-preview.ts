/** A block of the answer as far as the model has written it. `type` is null until its value is complete. */
export interface PreviewBlock {
  type: 'text' | 'example' | null;
  text: string;
}

/** What the learner's client is sent while the answer is written (plan 83, step 9). */
export interface AssistDelta {
  block: number;
  /** Set once the block's type is known; the final answer has the last word on it anyway. */
  type?: 'text' | 'example';
  text: string;
}

type Frame = { kind: 'object'; key: string | null; expectsKey: boolean } | { kind: 'array'; index: number };

/**
 * The blocks of an answer whose JSON has only partly arrived: `blocks[i].text` as far as it
 * goes, `blocks[i].type` once complete. Everything else in the answer — citations, suggestions,
 * emphasis — is left for the checked answer. Anything before the first `{` (a code fence, a
 * stray word) is skipped; a model that writes something that is not the answer's JSON simply
 * yields nothing here.
 *
 * Reads the whole prefix each time: an answer is a few kilobytes at most (Q4's output cap).
 */
export function previewBlocks(json: string): PreviewBlock[] {
  const blocks: PreviewBlock[] = [];
  const stack: Frame[] = [];
  const at = (index: number) => (blocks[index] ??= { type: null, text: '' });

  let i = json.indexOf('{');
  if (i < 0) return blocks;
  while (i < json.length) {
    const c = json[i];
    const top = stack[stack.length - 1];
    if (c === '"') {
      const string = readString(json, i + 1);
      if (top?.kind === 'object' && top.expectsKey) {
        if (!string.complete) break;
        top.key = string.value;
      } else {
        const path = stack.map((f) => (f.kind === 'object' ? f.key : f.index));
        if (path.length === 3 && path[0] === 'blocks' && typeof path[1] === 'number') {
          if (path[2] === 'text') at(path[1]).text = string.value;
          if (path[2] === 'type' && string.complete && (string.value === 'text' || string.value === 'example')) {
            at(path[1]).type = string.value;
          }
        }
      }
      if (!string.complete) break;
      i = string.end;
      continue;
    }
    if (c === '{') stack.push({ kind: 'object', key: null, expectsKey: true });
    else if (c === '[') stack.push({ kind: 'array', index: 0 });
    else if (c === '}' || c === ']') stack.pop();
    else if (c === ':' && top?.kind === 'object') top.expectsKey = false;
    else if (c === ',' && top?.kind === 'object') top.expectsKey = true;
    else if (c === ',' && top?.kind === 'array') top.index++;
    if (stack.length === 0) break;
    i++;
  }
  return blocks;
}

const ESCAPES: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };

/**
 * A JSON string from just after its opening quote: its value as far as it goes, and whether it
 * closed. An escape cut off at the end is left out, and so is a lone high surrogate — its pair
 * comes with the next piece, and the client is never sent half a character.
 */
function readString(json: string, from: number): { value: string; complete: boolean; end: number } {
  let value = '';
  let i = from;
  while (i < json.length) {
    const c = json[i];
    if (c === '"') return { value, complete: true, end: i + 1 };
    if (c !== '\\') {
      value += c;
      i++;
      continue;
    }
    const next = json[i + 1];
    if (next === undefined) break;
    if (next === 'u') {
      const hex = json.slice(i + 2, i + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) break;
      value += String.fromCharCode(parseInt(hex, 16));
      i += 6;
      continue;
    }
    value += ESCAPES[next] ?? next;
    i += 2;
  }
  const last = value.charCodeAt(value.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) value = value.slice(0, -1);
  return { value, complete: false, end: json.length };
}

/**
 * Follows one answer as its JSON arrives and says what is new in its blocks since the last
 * piece. Text only ever grows here: a reader for a new answer (the next round, a fallback)
 * starts from nothing.
 */
export class AssistAnswerPreview {
  private json = '';
  private readonly sent: PreviewBlock[] = [];

  push(piece: string): AssistDelta[] {
    this.json += piece;
    const deltas: AssistDelta[] = [];
    for (const [block, now] of previewBlocks(this.json).entries()) {
      if (!now) continue;
      const before = (this.sent[block] ??= { type: null, text: '' });
      const grown = now.text.startsWith(before.text) ? now.text.slice(before.text.length) : '';
      const typed = now.type !== null && before.type === null;
      if (grown === '' && !typed) continue;
      deltas.push(now.type ? { block, type: now.type, text: grown } : { block, text: grown });
      this.sent[block] = { type: now.type, text: now.text };
    }
    return deltas;
  }

  /** Whether anything of this answer has been sent. */
  get spoke(): boolean {
    return this.sent.some((b) => b && (b.text !== '' || b.type !== null));
  }
}
