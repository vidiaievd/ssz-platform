// A plausible wrong answer for step 3's «Try a student answer» — BEHAVIOR §4.
//
// The panel exists so the marking rules are chosen against a real answer, not in the
// abstract. The prototype's `dcMutate` hard-codes Norwegian (`kj` → `sj`, `å` → `aa`, single
// consonants); those rewrites are the language pack's `demo` (plan 68 §3.8). What is left
// here is language-free: drop the second-to-last word of a longer sentence, write it all in
// lower case. Nothing in the panel is stored (AC-B8).

import type { LanguagePack } from './presets.js';

export function demoAnswer(text: string, pack: LanguagePack): string {
  let out = (text ?? '').normalize('NFC');
  for (const r of pack.demo) {
    out = out.replace(new RegExp(r.from, r.ignoreCase === true ? 'giu' : 'gu'), r.to);
  }
  const words = out.split(/\s+/).filter((w) => w !== '');
  if (words.length > 5) words.splice(words.length - 2, 1);
  return words.join(' ').toLowerCase();
}
