import { studentSafeContent } from './student-safe-content.js';

// The one thing this service exists to guarantee: for word_bank_gap_fill the answers
// are inside `content.sentences[].text`, so anything that serves content to a learner
// has to cut them out first. Everything else here is about not breaking the other
// twelve templates while doing it.

const gapFillContent = {
  settings: {
    shuffle: false,
    allowReuse: false,
    showBankCount: true,
    caseSensitive: false,
    input: 'bank',
  },
  sentences: [
    { id: 's1', text: 'Jeg vil gjerne bestille en kaffe.', gaps: [3] },
    { id: 's2', text: 'Kan jeg få regningen, takk?', gaps: [3], hint: 'Du skal betale nå.' },
  ],
  distractors: ['bestilt', 'regning'],
};

/** Every string anywhere in the value, however deeply nested. */
function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(allStrings);
  return [];
}

describe('studentSafeContent', () => {
  it('leaves the other templates untouched, object identity included', () => {
    const content = { text_with_blanks: 'Jeg ___1___ norsk', word_bank: ['snakker'] };
    expect(studentSafeContent('fill_in_blank', content)).toBe(content);
  });

  it('removes every answer from the sentences of a gap-fill', () => {
    const projected = studentSafeContent('word_bank_gap_fill', gapFillContent);
    const sentences = allStrings((projected as { sentences: unknown }).sentences);

    for (const answer of ['bestille', 'regningen']) {
      expect(sentences.some((text) => text.includes(answer))).toBe(false);
    }
  });

  it('keeps the rest of the sentence readable, punctuation and all', () => {
    const projected = studentSafeContent('word_bank_gap_fill', gapFillContent) as {
      sentences: { id: string; hint?: string; tokens: Record<string, unknown>[] }[];
    };

    expect(projected.sentences[1]?.tokens).toEqual([
      { kind: 'text', text: 'Kan' },
      { kind: 'text', text: 'jeg' },
      { kind: 'text', text: 'få' },
      { kind: 'gap', gapKey: 's2#3', label: 'G2', before: '', after: ',' },
      { kind: 'text', text: 'takk?' },
    ]);
    expect(projected.sentences[1]?.hint).toBe('Du skal betale nå.');
  });

  it('still offers the bank, because a bank of the wrong words is not an exercise', () => {
    const projected = studentSafeContent('word_bank_gap_fill', gapFillContent) as {
      bank: string[];
    };
    expect([...projected.bank].sort()).toEqual(['bestille', 'bestilt', 'regning', 'regningen']);
  });

  it('never serves the bank in authoring order, which lists the answers first', () => {
    const projected = studentSafeContent('word_bank_gap_fill', gapFillContent) as {
      bank: string[];
    };
    expect(projected.bank).not.toEqual(['bestille', 'regningen', 'bestilt', 'regning']);
  });

  it('shuffles a shuffling exercise — eventually a different order than the sorted one', () => {
    const shuffling = {
      ...gapFillContent,
      settings: { ...gapFillContent.settings, shuffle: true },
    };
    const sorted = ['bestille', 'bestilt', 'regning', 'regningen'];

    // Four words have 24 orders; twenty draws all landing on the sorted one would be a
    // 24^-20 coincidence, so a failure here means the shuffle is not wired up.
    const orders = Array.from(
      { length: 20 },
      () => (studentSafeContent('word_bank_gap_fill', shuffling) as { bank: string[] }).bank,
    );
    expect(orders.some((order) => JSON.stringify(order) !== JSON.stringify(sorted))).toBe(true);
    for (const order of orders) expect([...order].sort()).toEqual(sorted);
  });

  it('has no bank at all in free-input mode', () => {
    const free = { ...gapFillContent, settings: { ...gapFillContent.settings, input: 'free' } };
    expect((studentSafeContent('word_bank_gap_fill', free) as { bank: unknown }).bank).toBeNull();
  });

  it('does not throw on content that is not the shape it expects', () => {
    expect(() => studentSafeContent('word_bank_gap_fill', {})).not.toThrow();
    expect(() => studentSafeContent('word_bank_gap_fill', { sentences: 'nonsense' })).not.toThrow();
  });
});
