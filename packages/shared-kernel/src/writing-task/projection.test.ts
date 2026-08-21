import { describe, expect, it } from 'vitest';

import type { WritingTask } from './model.js';
import { DEFAULT_AI, DEFAULT_SETTINGS } from './model.js';
import { toContent, toExpectedAnswers } from './persistence.js';
import { toStudentProjection } from './projection.js';

const MODEL_ANSWER = 'Hei, jeg heter Anna og bor i Kroken…';
const KEYWORD = 'med vennlig hilsen';
const DESCRIPTOR = 'Alle punktene er dekket';

function document(overrides: Partial<WritingTask> = {}): WritingTask {
  return {
    id: 'ex1',
    type: 'writing_task',
    moduleId: 'm1',
    title: 'Brev til kommunen',
    updatedAt: '2026-08-21T00:00:00.000Z',
    mode: 'letter',
    instruction: 'Skriv et sammenhengende brev.',
    prompt: 'Du har lest at kommunen vil stenge svømmehallen.',
    source: 'Kommunen har bestemt at svømmehallen stenger til høsten.',
    image: { assetId: 'asset-1', caption: 'Et bilde', alt: 'To personer i en park' },
    letter: { register: 'formal', recipient: 'Tromsø kommune' },
    points: [
      { id: 'p1', text: 'Presenter deg selv', keywords: ['jeg heter'], required: true },
      { id: 'p2', text: 'Avslutt høflig', keywords: [KEYWORD], required: false },
      // Half-written: never reaches the checklist, in the builder or here.
      { id: 'p3', text: '   ', keywords: [], required: true },
    ],
    phrases: ['Jeg skriver til dere fordi…'],
    model: MODEL_ANSWER,
    rubric: [
      {
        id: 'c1',
        name: 'Oppgaveløsning',
        desc: 'Er punktene dekket?',
        weight: 2,
        metric: 'points',
        levels: ['Svarer ikke', 'Ett punkt', 'De fleste', DESCRIPTOR],
      },
      {
        id: 'c2',
        name: 'Språk',
        desc: 'Setningsbygning og verbtider.',
        weight: 1,
        metric: 'language',
        levels: ['Uforståelig', 'Mange feil', 'Noen feil', 'Få feil'],
      },
    ],
    settings: { ...DEFAULT_SETTINGS, ai: { ...DEFAULT_AI } },
    ...overrides,
  };
}

/** Project a document the way the server does: through the two persisted columns. */
function project(ex: WritingTask) {
  return toStudentProjection(toContent(ex), toExpectedAnswers(ex));
}

/** Every string anywhere in the value, however deeply nested — keys included. */
function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, nested]) => [key, ...allStrings(nested)]);
  }
  return [];
}

// IMPLEMENTATION.md, "Security": the student payload contains no model, no keywords, and
// no level descriptors unless showRubric === 'always'.
describe('what may not leave the server', () => {
  it('carries no model answer, whatever showModel says', () => {
    for (const showModel of ['afterGraded', 'never'] as const) {
      const projection = project(document({ settings: { ...DEFAULT_SETTINGS, showModel } }));
      expect(allStrings(projection)).not.toContain(MODEL_ANSWER);
      expect(projection).not.toHaveProperty('model');
    }
  });

  it('carries the checklist text but never a point keyword', () => {
    const strings = allStrings(project(document()));

    expect(strings).toContain('Presenter deg selv');
    expect(strings).not.toContain('jeg heter');
    expect(strings).not.toContain(KEYWORD);
  });

  it('carries no level descriptors under showRubric: afterGraded or never', () => {
    for (const showRubric of ['afterGraded', 'never'] as const) {
      const projection = project(document({ settings: { ...DEFAULT_SETTINGS, showRubric } }));
      expect(projection.rubric).toBeUndefined();
      expect(allStrings(projection)).not.toContain(DESCRIPTOR);
    }
  });
});

// Plan 50 §5: with the rubric shown as a writing guide, the descriptors have to arrive
// before the mark — which is why this function takes the answer column at all.
describe('showRubric: always', () => {
  it('carries every criterion whole, descriptors included', () => {
    const projection = project(document({ settings: { ...DEFAULT_SETTINGS, showRubric: 'always' } }));

    expect(projection.rubric).toEqual([
      {
        id: 'c1',
        name: 'Oppgaveløsning',
        desc: 'Er punktene dekket?',
        weight: 2,
        levels: ['Svarer ikke', 'Ett punkt', 'De fleste', DESCRIPTOR],
      },
      {
        id: 'c2',
        name: 'Språk',
        desc: 'Setningsbygning og verbtider.',
        weight: 1,
        levels: ['Uforståelig', 'Mange feil', 'Noen feil', 'Få feil'],
      },
    ]);
  });

  it('matches descriptors to criteria by id, not by position', () => {
    const ex = document({ settings: { ...DEFAULT_SETTINGS, showRubric: 'always' } });
    const content = toContent(ex);
    const answers = toExpectedAnswers(ex);
    // The author reordered the rubric after the answers were written.
    content.rubric.reverse();

    const projection = toStudentProjection(content, answers);

    expect(projection.rubric?.[0]?.id).toBe('c2');
    expect(projection.rubric?.[0]?.levels[3]).toBe('Få feil');
    expect(projection.rubric?.[1]?.levels[3]).toBe(DESCRIPTOR);
  });

  it('leaves the descriptors empty rather than throwing when the answer column has none', () => {
    const ex = document({ settings: { ...DEFAULT_SETTINGS, showRubric: 'always' } });

    const projection = toStudentProjection(toContent(ex), null);

    expect(projection.rubric?.[0]?.levels).toEqual(['', '', '', '']);
  });
});

describe('the material of a mode', () => {
  it('sends a letter its recipient and register, and no source or image', () => {
    const projection = project(document({ mode: 'letter' }));

    expect(projection.letter).toEqual({ register: 'formal', recipient: 'Tromsø kommune' });
    expect(projection.source).toBeUndefined();
    expect(projection.image).toBeUndefined();
  });

  it('sends a retell its source text', () => {
    const projection = project(document({ mode: 'retell' }));

    expect(projection.source).toContain('svømmehallen stenger');
    expect(projection.letter).toBeUndefined();
  });

  it('sends a picture task its image', () => {
    const projection = project(document({ mode: 'picture' }));

    expect(projection.image).toEqual({
      assetId: 'asset-1',
      caption: 'Et bilde',
      alt: 'To personer i en park',
    });
  });

  it('withholds material the mode does not render, though the record still holds it', () => {
    // README: switching mode keeps the text fields; the student is not shown a source
    // text the task never mentions.
    const projection = project(document({ mode: 'essay' }));

    expect(projection.source).toBeUndefined();
    expect(projection.image).toBeUndefined();
    expect(projection.letter).toBeUndefined();
  });
});

describe('the rest of the payload', () => {
  it('drops points with no text and keeps the optional ones', () => {
    const projection = project(document());

    expect(projection.points).toEqual([
      { id: 'p1', text: 'Presenter deg selv', required: true },
      { id: 'p2', text: 'Avslutt høflig', required: false },
    ]);
  });

  it('sends the rubric maximum even when it sends no rubric', () => {
    const projection = project(document());

    // 3 × 2 + 3 × 1 — the denominator of the graded card's `N / M poeng`.
    expect(projection.rubricMax).toBe(9);
    expect(projection.rubric).toBeUndefined();
  });

  it('sends only the settings the runner acts on, and none of the AI stage', () => {
    const projection = project(document());

    expect(Object.keys(projection.settings).sort()).toEqual([
      'autosave',
      'blockPaste',
      'maxWords',
      'minWords',
      'passScore',
      'revision',
      'showModel',
      'showPhrases',
      'showPlan',
      'showRubric',
      'showWordCount',
      'timer',
    ]);
  });

  it('projects an empty document into a renderable empty task rather than throwing', () => {
    const projection = toStudentProjection(null, null);

    expect(projection.prompt).toBe('');
    expect(projection.points).toEqual([]);
    expect(projection.rubricMax).toBe(0);
    expect(projection.settings.minWords).toBe(DEFAULT_SETTINGS.minWords);
  });
});
