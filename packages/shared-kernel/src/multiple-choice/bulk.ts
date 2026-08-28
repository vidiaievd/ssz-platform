// Bulk paste — README "Step 1, Bulk paste": one question per line,
// `Stem | *right | wrong | wrong`, where `*` marks the key.
//
// Two rules from BEHAVIOR.md that look like edge cases and are not: with no `*` the first
// option becomes the key (a teacher pasting from a worksheet writes the answer first), and
// a line with no `|` at all becomes a stem with two empty options rather than being
// dropped — the paste is a way to get the stems in, and the options can follow.

import type { Option, Question } from './model.js';
import { newOption, newQuestion } from './model.js';

export function parseBulk(text: string): Question[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const parts = line.split('|').map((part) => part.trim()).filter((part) => part !== '');
      const stem = parts.shift() ?? '';
      const options: Option[] = parts.map((part) =>
        part.startsWith('*') ? newOption(part.slice(1).trim(), true) : newOption(part),
      );
      if (options.length > 0 && !options.some((o) => o.correct)) options[0]!.correct = true;

      const q = newQuestion('grammar');
      return { ...q, stem, options: options.length > 0 ? options : [newOption(), newOption()] };
    });
}
