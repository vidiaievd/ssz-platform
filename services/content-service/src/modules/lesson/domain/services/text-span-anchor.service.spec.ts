import { TextSpanAnchorService } from './text-span-anchor.service.js';

describe('TextSpanAnchorService', () => {
  it('finds the single new home of a snapshot after the body shifted', () => {
    const paragraphs = ['I går var det fint.', 'Sykepleieren jobber om natten.'];

    expect(TextSpanAnchorService.findCandidates(paragraphs, 'Sykepleieren')).toEqual([
      { paragraphIndex: 1, charStart: 0, charEnd: 12 },
    ]);
  });

  it('reports every occurrence when the snapshot is ambiguous', () => {
    const candidates = TextSpanAnchorService.findCandidates(['hus og hus'], 'hus');

    // Two candidates is exactly the case the UI must not auto-repair.
    expect(candidates).toEqual([
      { paragraphIndex: 0, charStart: 0, charEnd: 3 },
      { paragraphIndex: 0, charStart: 7, charEnd: 10 },
    ]);
  });

  it('returns nothing when the text was rewritten', () => {
    expect(TextSpanAnchorService.findCandidates(['Hun er lærer.'], 'Sykepleieren')).toEqual([]);
  });

  it('caps the suggestions rather than returning a search result', () => {
    const paragraphs = Array.from({ length: 10 }, () => 'hus');

    expect(TextSpanAnchorService.findCandidates(paragraphs, 'hus')).toHaveLength(5);
  });

  it('finds overlapping occurrences without looping forever', () => {
    expect(TextSpanAnchorService.findCandidates(['aaa'], 'aa')).toEqual([
      { paragraphIndex: 0, charStart: 0, charEnd: 2 },
      { paragraphIndex: 0, charStart: 1, charEnd: 3 },
    ]);
  });
});
