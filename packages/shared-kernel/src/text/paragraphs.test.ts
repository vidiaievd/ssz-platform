import { describe, expect, it } from 'vitest';

import { splitParagraphs, splitParagraphsWithOffsets } from './paragraphs.js';

// content-service's `MarkdownParagraphSplitterService.split`, verbatim. The kernel cannot
// import the service, so its one expression is restated here and compared on every case.
const serviceSplit = (body: string): string[] =>
  !body?.trim()
    ? []
    : body
        .split(/\n\s*\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

const CASES = [
  '',
  '   \n  ',
  'One paragraph.',
  '  Første avsnitt.  \n\nAndre avsnitt.\n\n\nTredje avsnitt.',
  'A\n\n\n\n\nB',
  'Line one\nline two of the same paragraph\n\nNext.',
  'Spaces on the blank line\n   \nstill split.',
  '\n\nLeading blank lines\n\n',
  'Tabs\n\t\nsplit too',
];

describe('splitParagraphs', () => {
  it.each(CASES)('agrees with content-service on %j', (body) => {
    expect(splitParagraphs(body)).toEqual(serviceSplit(body));
  });
});

describe('splitParagraphsWithOffsets', () => {
  it.each(CASES)('slices the body back to each paragraph for %j', (body) => {
    for (const p of splitParagraphsWithOffsets(body)) {
      expect(body.slice(p.bodyStart, p.bodyEnd)).toBe(p.text);
    }
  });

  it('numbers paragraphs after dropping the empty ones', () => {
    expect(splitParagraphsWithOffsets('\n\nA\n\n\n\nB').map((p) => p.index)).toEqual([0, 1]);
  });
});
