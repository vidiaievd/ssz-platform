import { describe, expect, it } from 'vitest';

import type { WritingTask } from './model.js';
import { DEFAULT_AI, DEFAULT_SETTINGS } from './model.js';
import { fromPersisted, readContent, toContent, toExpectedAnswers } from './persistence.js';

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
    source: '',
    image: { caption: '', alt: '' },
    letter: { register: 'formal', recipient: 'Tromsø kommune' },
    points: [
      { id: 'p1', text: 'Presenter deg selv', keywords: ['jeg heter', 'jeg bor'], required: true },
      { id: 'p2', text: 'Avslutt høflig', keywords: ['med vennlig hilsen'], required: true },
    ],
    phrases: ['Jeg skriver til dere fordi…'],
    model: 'Hei, jeg heter Anna og bor i Kroken…',
    rubric: [
      {
        id: 'c1',
        name: 'Oppgaveløsning',
        desc: 'Er punktene dekket?',
        weight: 2,
        metric: 'points',
        levels: ['Svarer ikke', 'Ett punkt', 'De fleste', 'Alle punktene'],
      },
    ],
    settings: { ...DEFAULT_SETTINGS, ai: { ...DEFAULT_AI } },
    ...overrides,
  };
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

describe('the content / expected_answers split', () => {
  it('keeps point keywords, rubric levels and the model answer out of content entirely', () => {
    const strings = allStrings(toContent(document()));

    expect(strings).toContain('Presenter deg selv');
    expect(strings).not.toContain('jeg heter');
    expect(strings).not.toContain('med vennlig hilsen');
    expect(strings).not.toContain('Alle punktene');
    expect(strings).not.toContain('Hei, jeg heter Anna og bor i Kroken…');
  });

  it('places the answer key entirely in expected_answers, keyed by id', () => {
    const answers = toExpectedAnswers(document());

    expect(answers.points['p1']?.keywords).toEqual(['jeg heter', 'jeg bor']);
    expect(answers.rubric['c1']?.levels).toEqual(['Svarer ikke', 'Ett punkt', 'De fleste', 'Alle punktene']);
    expect(answers.model).toBe('Hei, jeg heter Anna og bor i Kroken…');
  });
});

describe('fromPersisted', () => {
  it('round-trips a full document through content + expected_answers', () => {
    const doc = document();
    const envelope = { id: doc.id, moduleId: doc.moduleId, title: doc.title, updatedAt: doc.updatedAt };
    const rebuilt = fromPersisted(envelope, toContent(doc), toExpectedAnswers(doc));

    expect(rebuilt).toEqual(doc);
  });

  it('coerces garbage without throwing and fills defaults', () => {
    const envelope = { id: 'ex2', moduleId: 'm1', title: 'Untitled', updatedAt: '2026-08-21T00:00:00.000Z' };
    const rebuilt = fromPersisted(envelope, 'not an object', null);

    expect(rebuilt.mode).toBe('letter');
    expect(rebuilt.points).toEqual([]);
    expect(rebuilt.rubric).toEqual([]);
    expect(rebuilt.settings).toEqual(DEFAULT_SETTINGS);
    expect(rebuilt.model).toBe('');
  });

  it('reorders points and criteria without shuffling their answers', () => {
    const doc = document();
    const content = toContent(doc);
    // Reverse the array order — the answer lookup is by id, not by position.
    content.points.reverse();
    content.rubric.reverse();

    const envelope = { id: doc.id, moduleId: doc.moduleId, title: doc.title, updatedAt: doc.updatedAt };
    const rebuilt = fromPersisted(envelope, content, toExpectedAnswers(doc));

    expect(rebuilt.points.find((p) => p.id === 'p1')?.keywords).toEqual(['jeg heter', 'jeg bor']);
    expect(rebuilt.rubric.find((c) => c.id === 'c1')?.levels).toEqual([
      'Svarer ikke',
      'Ett punkt',
      'De fleste',
      'Alle punktene',
    ]);
  });

  it('defaults a missing answer to empty keywords / levels rather than throwing', () => {
    const doc = document();
    const envelope = { id: doc.id, moduleId: doc.moduleId, title: doc.title, updatedAt: doc.updatedAt };
    const rebuilt = fromPersisted(envelope, toContent(doc), { points: {}, rubric: {}, model: '' });

    expect(rebuilt.points[0]?.keywords).toEqual([]);
    expect(rebuilt.rubric[0]?.levels).toEqual(['', '', '', '']);
  });
});

describe('readContent', () => {
  it('never needs expected_answers to render the task material', () => {
    const content = readContent(toContent(document()));
    expect(content.prompt).toBe('Du har lest at kommunen vil stenge svømmehallen.');
    expect(content.points[0]).toEqual({ id: 'p1', text: 'Presenter deg selv', required: true });
  });
});
