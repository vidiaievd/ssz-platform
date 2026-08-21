import { studentSafeContent } from './student-safe-content.js';

// The one thing this service exists to guarantee: two templates store their answers
// inside `content` — word_bank_gap_fill in `sentences[].text`, match_pairs in
// `pairs[].right` — so anything that serves content to a learner has to cut them out
// first. Everything else here is about not breaking the other eleven while doing it.

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
    expect(studentSafeContent('fill_in_blank', content, {})).toBe(content);
  });

  it('removes every answer from the sentences of a gap-fill', () => {
    const projected = studentSafeContent('word_bank_gap_fill', gapFillContent, {});
    const sentences = allStrings((projected as { sentences: unknown }).sentences);

    for (const answer of ['bestille', 'regningen']) {
      expect(sentences.some((text) => text.includes(answer))).toBe(false);
    }
  });

  it('keeps the rest of the sentence readable, punctuation and all', () => {
    const projected = studentSafeContent('word_bank_gap_fill', gapFillContent, {}) as {
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
    const projected = studentSafeContent('word_bank_gap_fill', gapFillContent, {}) as {
      bank: string[];
    };
    expect([...projected.bank].sort()).toEqual(['bestille', 'bestilt', 'regning', 'regningen']);
  });

  it('never serves the bank in authoring order, which lists the answers first', () => {
    const projected = studentSafeContent('word_bank_gap_fill', gapFillContent, {}) as {
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
      () => (studentSafeContent('word_bank_gap_fill', shuffling, {}) as { bank: string[] }).bank,
    );
    expect(orders.some((order) => JSON.stringify(order) !== JSON.stringify(sorted))).toBe(true);
    for (const order of orders) expect([...order].sort()).toEqual(sorted);
  });

  it('has no bank at all in free-input mode', () => {
    const free = { ...gapFillContent, settings: { ...gapFillContent.settings, input: 'free' } };
    expect(
      (studentSafeContent('word_bank_gap_fill', free, {}) as { bank: unknown }).bank,
    ).toBeNull();
  });

  it('does not throw on content that is not the shape it expects', () => {
    expect(() => studentSafeContent('word_bank_gap_fill', {}, {})).not.toThrow();
    expect(() =>
      studentSafeContent('word_bank_gap_fill', { sentences: 'nonsense' }, {}),
    ).not.toThrow();
  });

  describe('match_pairs', () => {
    const matchContent = {
      variant: 'halves',
      settings: { distractors: true, shuffle: false, showRemaining: true },
      pairs: [
        { id: 'p1', rightId: 'h3', left: 'Hvis det regner i morgen,', right: 'blir vi hjemme.' },
        {
          id: 'p2',
          rightId: 'h1',
          left: 'Jeg rakk ikke bussen fordi',
          right: 'jeg sto opp for sent.',
        },
        { id: 'p3', rightId: 'h4', left: 'Da vi var små,', right: 'bodde vi i Bergen.' },
      ],
      distractors: [{ id: 'h2', text: 'sto jeg opp for sent.' }],
    };

    type Projection = {
      slots: Array<{ slotId: string; left: string }>;
      pool: Array<{ itemId: string; text: string }>;
      settings: { showRemaining: boolean };
    };

    const project = (content: Record<string, unknown> = matchContent) =>
      studentSafeContent('match_pairs', content, {}) as unknown as Projection;

    it('keeps the left halves as slots and drops the right ones', () => {
      const projected = project();

      expect(projected.slots).toEqual([
        { slotId: 'p1', left: 'Hvis det regner i morgen,' },
        { slotId: 'p2', left: 'Jeg rakk ikke bussen fordi' },
        { slotId: 'p3', left: 'Da vi var små,' },
      ]);
      expect(allStrings(projected.slots)).not.toContain('blir vi hjemme.');
    });

    it('shares no identifier between a slot and any pool item (AC-S15)', () => {
      // The whole reason `rightId` is not the pair id. If these overlapped, the payload
      // would name its own answers and the shuffle would not matter.
      const projected = project();
      const slotIds = new Set(projected.slots.map((slot) => slot.slotId));

      expect(projected.pool.filter((item) => slotIds.has(item.itemId))).toEqual([]);
    });

    it('makes answers and distractors indistinguishable in the pool', () => {
      const projected = project();

      expect(projected.pool).toHaveLength(4);
      for (const item of projected.pool) {
        expect(Object.keys(item).sort()).toEqual(['itemId', 'text']);
      }
    });

    it('carries no pairing, no feedback and no reveal note', () => {
      const projected = project();
      const keys = JSON.stringify(projected);

      expect(keys).not.toContain('rightId');
      expect(keys).not.toContain('feedback');
      expect(keys).not.toContain('why');
      expect(keys).not.toContain('"right"');
    });

    it('shuffles the pool when the exercise asks for it', () => {
      const shuffling = { ...matchContent, settings: { ...matchContent.settings, shuffle: true } };
      const inOrder = [
        'blir vi hjemme.',
        'jeg sto opp for sent.',
        'bodde vi i Bergen.',
        'sto jeg opp for sent.',
      ];

      // Four items have 24 orders; twenty draws all landing on the authored one would be
      // a 24^-20 coincidence, so a failure here means the shuffle is not wired up.
      const orders = Array.from({ length: 20 }, () =>
        project(shuffling).pool.map((item) => item.text),
      );
      expect(orders.some((order) => JSON.stringify(order) !== JSON.stringify(inOrder))).toBe(true);
      for (const order of orders) expect([...order].sort()).toEqual([...inOrder].sort());
    });

    it('leaves the extras out of the pool when they are switched off', () => {
      const noExtras = {
        ...matchContent,
        settings: { ...matchContent.settings, distractors: false },
      };
      const texts = project(noExtras).pool.map((item) => item.text);

      expect(texts).not.toContain('sto jeg opp for sent.');
      expect(texts).toHaveLength(3);
    });

    it('does not throw on content that is not the shape it expects', () => {
      expect(() => studentSafeContent('match_pairs', {}, {})).not.toThrow();
      expect(() => studentSafeContent('match_pairs', { pairs: 'nonsense' }, {})).not.toThrow();
    });
  });

  describe('writing_task', () => {
    const writingContent = {
      mode: 'letter',
      instruction: 'Skriv et sammenhengende brev.',
      prompt: 'Kommunen vil stenge svømmehallen.',
      letter: { register: 'formal', recipient: 'Tromsø kommune' },
      points: [{ id: 'p1', text: 'Presenter deg selv', required: true }],
      phrases: [],
      rubric: [
        {
          id: 'c1',
          name: 'Oppgaveløsning',
          desc: 'Er punktene dekket?',
          weight: 2,
          metric: 'points',
        },
      ],
      settings: { minWords: 120, maxWords: 200, passScore: 4, showRubric: 'afterGraded' },
    };

    const writingAnswers = {
      points: { p1: { keywords: ['jeg heter'] } },
      rubric: { c1: { levels: ['Svarer ikke', 'Ett punkt', 'De fleste', 'Alle punktene'] } },
      model: 'Hei, jeg heter Anna…',
    };

    type Projection = {
      prompt: string;
      points: Array<{ id: string; text: string }>;
      rubric?: Array<{ id: string; levels: string[] }>;
      rubricMax: number;
    };

    const project = (
      content: Record<string, unknown> = writingContent,
      answers: Record<string, unknown> = writingAnswers,
    ) => studentSafeContent('writing_task', content, answers) as unknown as Projection;

    it('keeps the checklist and drops the keywords, the descriptors and the example answer', () => {
      const projected = project();

      expect(projected.points).toEqual([{ id: 'p1', text: 'Presenter deg selv', required: true }]);
      expect(JSON.stringify(projected)).not.toContain('jeg heter');
      expect(JSON.stringify(projected)).not.toContain('Alle punktene');
      expect(JSON.stringify(projected)).not.toContain('Hei, jeg heter Anna…');
      expect(projected.rubric).toBeUndefined();
    });

    it('carries the level descriptors when the author shows the rubric while writing', () => {
      // The one case that needs the answer column before a grade — plan 50 §5. A
      // projection built from `content` alone would pass every other test in this file.
      const always = {
        ...writingContent,
        settings: { ...writingContent.settings, showRubric: 'always' },
      };

      expect(project(always).rubric).toEqual([
        {
          id: 'c1',
          name: 'Oppgaveløsning',
          desc: 'Er punktene dekket?',
          weight: 2,
          levels: ['Svarer ikke', 'Ett punkt', 'De fleste', 'Alle punktene'],
        },
      ]);
    });

    it('sends the rubric maximum even with the rubric itself withheld', () => {
      expect(project().rubricMax).toBe(6);
    });

    it('does not throw on a document in the pre-plan-50 shape', () => {
      const old = { prompt: 'Skriv om ferien din.', min_words: 120, max_words: 200 };

      expect(() => studentSafeContent('writing_task', old, {})).not.toThrow();
      expect(project(old, {}).prompt).toBe('Skriv om ferien din.');
    });
  });
});
