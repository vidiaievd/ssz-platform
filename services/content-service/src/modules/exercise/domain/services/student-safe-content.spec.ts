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
  describe('short_answer', () => {
    // The anchors are not merely sensitive: they are the answer written in the words the
    // student is being asked to find. This block is the guard on that.
    const shortAnswerContent = {
      title: 'Leseforståelse — sykkelregler',
      instruction: 'Svar med egne ord.',
      questions: [
        {
          id: 'q1',
          kind: 'reading',
          passage: 'Fra 1. januar må alle som sykler i mørket ha lys foran og bak.',
          prompt: 'Hva er nytt fra 1. januar?',
        },
        {
          id: 'q2',
          kind: 'listening',
          passage: 'God morgen, dette er nyhetene fra NRK.',
          prompt: 'Hvem snakker?',
        },
      ],
      settings: {
        passRule: 'all',
        passN: 2,
        typos: true,
        caseless: true,
        minWords: 3,
        showBreakdown: true,
        showModel: 'onClose',
        aiStage: false,
        aiGrammar: true,
        teacherReview: 'flagged',
        progress: true,
      },
    };

    const shortAnswerKey = {
      questions: {
        q1: {
          elements: [
            { id: 'e1', label: 'Kravet om lykt', anchors: ['lykt foran'], required: true },
          ],
          model: 'Alle syklister må ha lykt foran og bak i mørket.',
          why: 'Regelen står i første setning.',
        },
        q2: {
          elements: [{ id: 'e2', label: 'Kringkasteren', anchors: ['nrk'], required: true }],
          model: 'Det er NRK som sender nyhetene.',
          why: 'Kanalen nevner seg selv.',
        },
      },
    };

    type Projection = {
      instruction: string;
      questions: Array<{ id: string; prompt: string; passage?: string; model?: string }>;
      settings: { showModel: string; showBreakdown: boolean };
    };

    const project = (
      content: Record<string, unknown> = shortAnswerContent,
      answers: Record<string, unknown> = shortAnswerKey,
    ) => studentSafeContent('short_answer', content, answers) as unknown as Projection;

    it('keeps the questions and drops the elements, the model answers and the explanations', () => {
      const projected = project();

      expect(projected.questions.map((q) => q.id)).toEqual(['q1', 'q2']);
      expect(projected.questions[0]?.prompt).toBe('Hva er nytt fra 1. januar?');

      const serialised = JSON.stringify(projected);
      expect(serialised).not.toContain('lykt foran');
      expect(serialised).not.toContain('Kravet om lykt');
      expect(serialised).not.toContain('Alle syklister');
      expect(serialised).not.toContain('Regelen står');
    });

    it('withholds a listening transcript — it is what the audio says', () => {
      const projected = project();

      expect(projected.questions[0]?.passage).toBeDefined();
      expect(projected.questions[1]?.passage).toBeUndefined();
      expect(JSON.stringify(projected)).not.toContain('God morgen');
    });

    it('carries the model answer when the author shows it while writing', () => {
      // The same case as `showRubric: 'always'` above, and the second reason this
      // function takes the answer column at all — plan 51 §6.2.
      const always = {
        ...shortAnswerContent,
        settings: { ...shortAnswerContent.settings, showModel: 'always' },
      };

      expect(project(always).questions[0]?.model).toBe(
        'Alle syklister må ha lykt foran og bak i mørket.',
      );
    });

    it('leaves a document of the old form exactly as it is', () => {
      // Plan 51 §8 Q1: 144 of these are still live. The new projection would find no
      // `questions` and hand back an empty set, blanking an exercise that works.
      const old = { question: 'Hvorfor trenger de egenkapital?', context: 'Tekst 3A.' };

      expect(
        studentSafeContent('short_answer', old, { accepted_answers: ['De må ha egenkapital'] }),
      ).toBe(old);
    });

    it('survives a document whose key has already been taken away', () => {
      // content-service projects and nulls the key; the engine's start-attempt projects
      // again. The second pass must not throw and must not blank the questions.
      expect(() => project(shortAnswerContent, {})).not.toThrow();
      expect(project(shortAnswerContent, {}).questions.map((q) => q.id)).toEqual(['q1', 'q2']);
    });
  });
  describe('sentence_schema', () => {
    // Plan 52 §3.2. The key is `chunk.field`, `chunk.alt`, `row.why` and `row.fb` — and
    // `row.text`, which the handoff's Security section omits: a sentence in its correct
    // order is the answer written out as a string.
    const settings = {
      labels: true,
      hints: false,
      counts: false,
      prefill: 'none',
      markEmpty: false,
      perField: true,
      hintAfterMistake: true,
      // Off in the fixture so the bank can be asserted in order. The shuffle itself is
      // tested below — it is a security property here, not a presentation one.
      shuffle: false,
      extras: true,
      order: 'strict',
    };

    const schemaContent = {
      title: 'Indirekte tale',
      instruction: 'Bygg om setningen og legg den i skjemaet.',
      presetId: 'blank',
      clauses: ['sub'],
      schema: {
        sub: [
          { id: 'f-sub', short: 'sub', label: 'Subjunksjon', hint: '', optional: false },
          { id: 'f-subj', short: 'n', label: 'Subjekt', hint: '', optional: false },
          { id: 'f-adv', short: 'a', label: 'Adverbial', hint: '', optional: true },
          { id: 'f-v', short: 'v', label: 'Verbal', hint: '', optional: false },
          { id: 'f-slutt', short: 'N', label: 'Sluttfelt', hint: '', optional: true },
        ],
      },
      rows: [
        {
          id: 'r1',
          clause: 'sub',
          source: '«Jeg kommer i morgen», sa han.',
          chunks: [
            { id: 'c1', text: 'at' },
            { id: 'c2', text: 'han' },
            { id: 'c3', text: 'kommer' },
            { id: 'c4', text: 'i morgen' },
          ],
          extras: [{ id: 'x1', text: 'ikke' }],
        },
      ],
      settings,
    } as Record<string, unknown>;

    const schemaKey = {
      rows: {
        r1: {
          text: 'at han kommer i morgen',
          why: 'Subjunksjonen «at» innleder leddsetningen, og verbet står etter subjektet.',
          fields: { c1: 'f-sub', c2: 'f-subj', c3: 'f-v', c4: 'f-slutt' },
          alt: { c4: ['f-adv'] },
          fb: { c3: 'I en leddsetning kommer verbet etter subjektet.' },
        },
      },
    } as Record<string, unknown>;

    interface Projection {
      title: string;
      instruction: string;
      rows: Array<{
        id: string;
        source: string;
        bank: Array<{ id: string; text: string }>;
        counts: Record<string, number> | null;
        start: Record<string, string[]>;
        fields: Array<{ id: string; short: string }>;
      }>;
    }

    const project = (
      content: Record<string, unknown> = schemaContent,
      answers: Record<string, unknown> = schemaKey,
    ) => studentSafeContent('sentence_schema', content, answers) as unknown as Projection;

    it('ships the pieces and drops every trace of where they go', () => {
      const projected = project();

      expect(projected.rows[0]?.bank.map((item) => item.text)).toEqual([
        'at',
        'han',
        'kommer',
        'i morgen',
        'ikke',
      ]);

      // The field ids do travel, and must: they are the columns of the board the
      // student places into. What may not travel is the mapping from a piece to its
      // field, which is the whole answer.
      expect(projected.rows[0]?.fields.map((f) => f.id)).toEqual([
        'f-sub',
        'f-subj',
        'f-adv',
        'f-v',
        'f-slutt',
      ]);

      const serialised = JSON.stringify(projected);
      for (const pairing of ['"c1":"f-sub"', '"c3":"f-v"', '"c4":["f-adv"]']) {
        expect(serialised).not.toContain(pairing);
      }
      expect(serialised).not.toContain('Subjunksjonen «at»');
      expect(serialised).not.toContain('verbet etter subjektet');
    });

    it('withholds the sentence itself — it is the word order, written out', () => {
      // Not on the handoff's list, and the one addition plan 52 §3.2 makes to it. The
      // runner never renders `row.text`, so withholding it costs nothing.
      expect(JSON.stringify(project())).not.toContain('at han kommer i morgen');
    });

    it('keeps the sentence to rewrite — it is the prompt, not the key', () => {
      // §3.8: the transformation mode is the one extension beyond the handoff, and it
      // exists because every seeded exercise of this type is a transformation. The
      // source is shown, banked from nothing, and graded not at all.
      expect(project().rows[0]?.source).toBe('«Jeg kommer i morgen», sa han.');
      expect(project().rows[0]?.bank.map((i) => i.text)).not.toContain('sa');
    });

    it('shuffles the bank here, where the key is, rather than in the browser', () => {
      // A bank in sentence order is the answer in order. The shuffle is part of the
      // projection for that reason and not because the pieces look nicer mixed up.
      const shuffling = {
        ...schemaContent,
        settings: { ...settings, shuffle: true },
      };

      const orders = new Set(
        Array.from({ length: 20 }, () =>
          project(shuffling)
            .rows[0]?.bank.map((i) => i.id)
            .join(','),
        ),
      );

      expect(orders.size).toBeGreaterThan(1);
      // Same pieces every time — only the order moves.
      for (const order of orders) {
        expect(order.split(',').sort()).toEqual(['c1', 'c2', 'c3', 'c4', 'x1']);
      }
    });

    it('withholds the per-field counts unless the author switched them on', () => {
      // The numbers are a partial key: a one-chunk field with a count of one is solved
      // by elimination. So the author's decision is enforced where the payload is built.
      expect(project().rows[0]?.counts).toBeNull();

      const counting = { ...schemaContent, settings: { ...settings, counts: true } };
      expect(project(counting).rows[0]?.counts).toEqual({
        'f-sub': 1,
        'f-subj': 1,
        'f-adv': 0,
        'f-v': 1,
        'f-slutt': 1,
      });
    });

    it('drops a sentence the author has not finished placing', () => {
      // A row with an unplaced chunk has no key to be graded against, and a student
      // cannot be asked to solve a sentence whose answer does not exist yet.
      const halfWritten = {
        ...schemaKey,
        rows: {
          r1: {
            ...(schemaKey['rows'] as Record<string, Record<string, unknown>>)['r1'],
            fields: { c1: 'f-sub', c2: null, c3: null, c4: null },
          },
        },
      };

      expect(project(schemaContent, halfWritten).rows).toEqual([]);
    });

    it('leaves a document of the old form exactly as it is', () => {
      // Plan 52 §8 Q3: six of the seven exercises stay this way. The new projection
      // would find no `rows` and hand back an empty set, blanking an exercise that works.
      const old = {
        sentence: 'I morgen skal jeg reise til Bergen.',
        source_sentence: 'Jeg skal reise til Bergen i morgen.',
        schema_type: 'main',
        fields: [{ id: 'forfelt', label: 'Forfelt' }],
        tokens: [{ id: 't1', text: 'I morgen' }],
      };

      expect(
        studentSafeContent('sentence_schema', old, {
          placements: [{ field_id: 'forfelt', token_ids: ['t1'] }],
        }),
      ).toBe(old);
    });
  });
});
