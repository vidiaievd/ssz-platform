import { describe, expect, it } from 'vitest';

import { analyse, hasPhrase, paragraphs, rubricMax, rubricScore, usablePoints, words } from './analysis.js';
import type { Criterion, Point, WritingTaskContent } from './model.js';
import { DEFAULT_AI, DEFAULT_SETTINGS, defaultRubric } from './model.js';

function point(overrides: Partial<Point>): Point {
  return { id: overrides.id ?? 'p', text: '', keywords: [], required: true, ...overrides };
}

function content(overrides: Partial<WritingTaskContent> = {}): WritingTaskContent {
  return {
    mode: 'letter',
    instruction: '',
    prompt: 'Skriv et brev.',
    source: '',
    image: { caption: '', alt: '' },
    letter: { register: 'formal', recipient: '' },
    points: [],
    phrases: [],
    model: '',
    rubric: defaultRubric(),
    settings: { ...DEFAULT_SETTINGS, minWords: 120, maxWords: 200, ai: { ...DEFAULT_AI } },
    ...overrides,
  };
}

describe('hasPhrase', () => {
  it('requires a contiguous run', () => {
    const text = words('Med vennlig hilsen, Anna');
    expect(hasPhrase(text, 'med vennlig hilsen')).toBe(true);
    expect(hasPhrase(text, 'med hilsen')).toBe(false);
  });

  it('is case- and punctuation-insensitive but not inflection-insensitive', () => {
    const text = words('Vi svømmer i svømmehallen hver uke.');
    expect(hasPhrase(text, 'SVØMMEHALLEN')).toBe(true);
    expect(hasPhrase(text, 'svømmehall')).toBe(false);
  });

  it('returns false for an empty phrase', () => {
    expect(hasPhrase(words('noe tekst'), '   ')).toBe(false);
  });
});

describe('paragraphs', () => {
  it('counts blank-line-separated blocks', () => {
    expect(paragraphs('Første.\n\nAndre.\n\nTredje.')).toHaveLength(3);
  });

  it('does not add a paragraph for trailing newlines', () => {
    expect(paragraphs('Ett avsnitt.\n\n\n')).toHaveLength(1);
  });

  it('is empty for an empty string', () => {
    expect(paragraphs('')).toHaveLength(0);
  });
});

describe('usablePoints / analyse on an empty string', () => {
  it('drops points with empty text', () => {
    const ex = content({ points: [point({ id: 'p1', text: 'Skriv noe' }), point({ id: 'p2', text: '  ' })] });
    expect(usablePoints(ex).map((p) => p.id)).toEqual(['p1']);
  });

  it('returns length "empty", zero everything, and does not throw', () => {
    const ex = content({ points: [point({ id: 'p1', text: 'Skriv noe', keywords: ['noe'] })] });
    const a = analyse(ex, '');

    expect(a.length).toBe('empty');
    expect(a.words).toBe(0);
    expect(a.paragraphs).toBe(0);
    expect(a.cover).toEqual([{ id: 'p1', text: 'Skriv noe', required: true, hit: false }]);
    expect(a.hitCount).toBe(0);
  });
});

describe('rubricMax / rubricScore', () => {
  it('respects weight', () => {
    const rubric: Criterion[] = [
      { id: 'a', name: 'A', desc: '', weight: 2, metric: null, levels: ['', '', '', ''] },
      { id: 'b', name: 'B', desc: '', weight: 1, metric: null, levels: ['', '', '', ''] },
    ];
    expect(rubricMax({ rubric })).toBe(3 * 2 + 3 * 1);
    expect(rubricScore({ rubric }, { a: 3, b: 1 })).toBe(3 * 2 + 1 * 1);
  });

  it('treats a missing mark as 0', () => {
    const rubric: Criterion[] = [{ id: 'a', name: 'A', desc: '', weight: 2, metric: null, levels: ['', '', '', ''] }];
    expect(rubricScore({ rubric }, {})).toBe(0);
  });
});

describe('optional points are excluded from neededCount but present in cover', () => {
  it('does not count an optional point towards hitCount/neededCount', () => {
    const ex = content({
      points: [
        point({ id: 'p1', text: 'Obligatorisk', keywords: ['obligatorisk'], required: true }),
        point({ id: 'p2', text: 'Valgfritt', keywords: ['aldri i teksten'], required: false }),
      ],
    });
    const a = analyse(ex, 'Dette er obligatorisk.');

    expect(a.neededCount).toBe(1);
    expect(a.hitCount).toBe(1);
    expect(a.cover).toHaveLength(2);
    expect(a.cover.find((c) => c.id === 'p2')?.hit).toBe(false);
  });
});

describe('criterion metric drives the suggestion, not rubric position', () => {
  it('gives no suggestion for metric: null, and a custom order still works', () => {
    const rubric: Criterion[] = [
      { id: 'lex', name: 'Ordforråd', desc: '', weight: 1, metric: 'lexis', levels: ['', '', '', ''] },
      { id: 'none', name: 'Ikke målbart', desc: '', weight: 1, metric: null, levels: ['', '', '', ''] },
    ];
    const ex = content({ rubric });
    const a = analyse(ex, 'et to tre fire fem seks sju åtte ni ti');

    expect(a.suggested['none']).toBeUndefined();
    expect(a.suggested['lex']).toBe(3); // 10 unique / 10 words = 1.0 ratio
    expect(a.total).toBe(3); // the null-metric criterion contributes 0
  });
});

describe('worked analysis cases (BEHAVIOR.md §8 — the sample letter)', () => {
  const rubric = defaultRubric();
  const points: Point[] = [
    point({ id: 'p1', text: 'Presenter deg selv', keywords: ['jeg heter', 'jeg skriver', 'jeg bor'] }),
    point({ id: 'p2', text: 'Forklar hva svømmehallen betyr', keywords: ['svømmehallen', 'barna', 'trener', 'hver uke'] }),
    point({ id: 'p3', text: 'Kom med et forslag', keywords: ['jeg foreslår', 'kan dere', 'forslag', 'i stedet'] }),
    point({ id: 'p4', text: 'Avslutt høflig', keywords: ['med vennlig hilsen', 'på forhånd takk'] }),
  ];
  const ex = content({ rubric, points, settings: { ...DEFAULT_SETTINGS, minWords: 120, maxWords: 200, ai: { ...DEFAULT_AI } } });

  it('full four-paragraph letter: all points, 4 paragraphs, high ratio', () => {
    const text = [
      'Jeg heter Anna og bor i Kroken. Jeg skriver til dere fordi jeg leste at svømmehallen skal stenge.',
      'Barna mine trener der hver uke, og selv trener jeg der to ganger i uka.',
      'Jeg foreslår at dere heller korter ned åpningstidene i stedet for å stenge helt.',
      'Med vennlig hilsen\nAnna',
    ].join('\n\n');
    const a = analyse(ex, text);

    expect(a.hitCount).toBe(4);
    expect(a.paragraphs).toBe(4);
    expect(a.suggested[rubric[0]!.id]).toBe(3); // task completion — all points hit
    expect(a.suggested[rubric[1]!.id]).toBe(3); // structure — >= 3 paragraphs
  });

  it('one paragraph, one point hit: low task-completion and structure marks', () => {
    const a = analyse(ex, 'Svømmehallen betyr mye for barna, de trener der hver uke.');

    expect(a.hitCount).toBe(1);
    expect(a.paragraphs).toBe(1);
    expect(a.suggested[rubric[0]!.id]).toBe(1); // 1 of 4 required points
    expect(a.suggested[rubric[1]!.id]).toBe(0); // one paragraph, under 60 words
  });

  it('correct content in one block (no blank lines): task ok, structure penalised', () => {
    const text =
      'Jeg heter Anna og bor i Kroken. Jeg skriver fordi svømmehallen skal stenge. Barna mine trener der hver uke. Jeg foreslår at dere venter til våren i stedet. Med vennlig hilsen.';
    const a = analyse(ex, text);

    expect(a.paragraphs).toBe(1);
    expect(a.suggested[rubric[1]!.id]).toBe(0); // one paragraph, under 60 words
  });

  it('long text over maxWords is flagged "long"', () => {
    const long = Array.from({ length: 210 }, (_, i) => `ord${i}`).join(' ');
    const a = analyse(ex, long);
    expect(a.length).toBe('long');
  });

  it('proposal-only sentence: exactly one point hit via its keyword', () => {
    const a = analyse(ex, 'Jeg foreslår at dere ikke stenger.');
    expect(a.hitCount).toBe(1);
    expect(a.cover.find((c) => c.id === 'p3')?.hit).toBe(true);
  });
});
