// Plan 53 §3.2 and §3.4 — what reaches the browser, and in what order.

import { describe, expect, it } from 'vitest';

import { toStudentProjection } from './projection.js';
import { toContent } from './persistence.js';
import { content, option, question, settings } from './fixtures.test-support.js';

const reverse = <T,>(items: readonly T[]): T[] => [...items].reverse();

describe('what is withheld', () => {
  it('ships no key, no rule and no rebuttal — in any field, at any depth', () => {
    const serialised = JSON.stringify(toStudentProjection(toContent(content())));
    expect(serialised).not.toContain('correct');
    expect(serialised).not.toContain('Indirekte tale i fortid');
    expect(serialised).not.toContain('Etter «sa»');
    expect(serialised).not.toContain('why');
  });

  it('ships only the settings the runner can act on', () => {
    expect(Object.keys(toStudentProjection(toContent(content())).settings).sort()).toEqual([
      'eliminate',
      'instant',
      'layout',
      'letters',
      'progress',
      'retry',
    ]);
  });

  it('keeps a listening transcript author-side and shows a reading passage', () => {
    const ex = content({
      questions: [
        question({ id: 'q1', kind: 'listening', context: 'Full transcript.' }),
        question({ id: 'q2', kind: 'reading', context: 'Fra 1. januar…' }),
      ],
    });
    const projected = toStudentProjection(toContent(ex));
    expect(projected.questions[0]!.context).toBeUndefined();
    expect(projected.questions[1]!.context).toBe('Fra 1. januar…');
  });
});

describe('what is dropped', () => {
  it('drops empty options', () => {
    const ex = content({
      questions: [
        question({
          options: [
            option({ id: 'a', text: 'er' }),
            option({ id: 'b', text: 'var', correct: true }),
            option({ id: 'c', text: '  ' }),
          ],
        }),
      ],
    });
    expect(toStudentProjection(toContent(ex)).questions[0]!.options.map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('drops a question that could not be answered', () => {
    const ex = content({ questions: [question({ id: 'q1' }), question({ id: 'q2', stem: '' })] });
    expect(toStudentProjection(toContent(ex)).questions.map((q) => q.id)).toEqual(['q1']);
  });
});

describe('order', () => {
  it('applies the injected shuffle and pins fixed options last', () => {
    const ex = content({
      questions: [
        question({
          options: [
            option({ id: 'a', text: 'er' }),
            option({ id: 'b', text: 'var', correct: true }),
            option({ id: 'z', text: 'Ingen av disse', fixed: true }),
          ],
        }),
      ],
    });
    expect(toStudentProjection(toContent(ex), reverse).questions[0]!.options.map((o) => o.id)).toEqual([
      'b',
      'a',
      'z',
    ]);
  });

  it('leaves author order when shuffle is off, whatever is injected', () => {
    const ex = content({ settings: settings({ shuffle: false }) });
    expect(toStudentProjection(toContent(ex), reverse).questions[0]!.options.map((o) => o.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('shuffles the questions only under shuffleQuestions', () => {
    const questions = [question({ id: 'q1' }), question({ id: 'q2' })];
    const plain = content({ questions });
    const shuffled = content({ questions, settings: settings({ shuffleQuestions: true }) });

    expect(toStudentProjection(toContent(plain), reverse).questions.map((q) => q.id)).toEqual(['q1', 'q2']);
    expect(toStudentProjection(toContent(shuffled), reverse).questions.map((q) => q.id)).toEqual(['q2', 'q1']);
  });

  it('survives being run twice over a document whose key was already stripped', () => {
    const once = toStudentProjection(toContent(content()));
    expect(() => toStudentProjection(once)).not.toThrow();
  });
});
