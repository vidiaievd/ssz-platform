/**
 * The narration token of a lesson body: `[audio:<id>]` or `[audio:<id> "label"]`. Same grammar
 * as `MarkdownMediaParserService` and as the editor's `lesson-media-tokens` — the authoring
 * screen treats the first token as the lesson's narration, and so does the batch.
 */
const AUDIO_TOKEN = /\[audio:([a-zA-Z0-9_-]+)(?:\s+"([^"]*)")?\]/g;

export interface AudioToken {
  mediaId: string;
  label: string | null;
}

export function findAudioTokens(body: string): AudioToken[] {
  return [...body.matchAll(AUDIO_TOKEN)].map((match) => ({ mediaId: match[1] ?? '', label: match[2] ?? null }));
}

/** Points the body's only narration token at `mediaId`, or appends one at the end. */
export function setAudioNarration(body: string, mediaId: string, label: string | null): string {
  const token = label ? `[audio:${mediaId} "${label}"]` : `[audio:${mediaId}]`;
  const first = new RegExp(AUDIO_TOKEN.source);
  if (first.test(body)) return body.replace(first, () => token);
  return body.trim() ? `${body}\n\n${token}` : token;
}
