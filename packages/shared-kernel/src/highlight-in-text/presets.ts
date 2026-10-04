// The standing instruction by course language — plan 67 §3.7.
//
// The prototype seeds «Les teksten og marker det oppgaven spør om.» into every new exercise;
// the handoff itself forbids anything Norwegian in code (CLAUDE.md, rule 9). Precedent:
// plan 66 §3.6 (`sort_into_buckets` packs by course language), plan 53 §3.6. **No pack for
// the language → an empty instruction** the author writes; guessing Norwegian for a Ukrainian
// course is the failure this file exists to avoid.

export interface LanguagePack {
  /** ISO 639-1 codes this pack answers for. */
  langs: readonly string[];
  instruction: string;
}

export const PACKS: readonly LanguagePack[] = [
  { langs: ['nb', 'nn', 'no'], instruction: 'Les teksten og marker det oppgaven spør om.' },
  { langs: ['en'], instruction: 'Read the text and mark what the question asks for.' },
  { langs: ['uk'], instruction: 'Прочитайте текст і позначте те, про що питає завдання.' },
  { langs: ['ru'], instruction: 'Прочитайте текст и отметьте то, о чём спрашивает задание.' },
];

export function packFor(lang: string | null | undefined): LanguagePack | null {
  const code = (lang ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return PACKS.find((p) => p.langs.includes(code)) ?? null;
}

export function instructionFor(lang: string | null | undefined): string {
  return packFor(lang)?.instruction ?? '';
}
