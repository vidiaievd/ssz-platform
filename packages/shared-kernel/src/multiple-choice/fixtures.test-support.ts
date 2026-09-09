// Shared fixtures for the `multiple_choice` tests.
//
// Deliberately close to the two sets the first lesson of Norsk B1 is being rewritten into
// (plan 53 §1.1): a tense-agreement question with four options, and a riktig/galt pair.

import type { MultipleChoiceContent, Option, Question, Settings } from './model.js';
import { DEFAULT_SETTINGS } from './model.js';

export function option(overrides: Partial<Option> & { id: string }): Option {
  return { text: '', correct: false, why: '', fixed: false, ...overrides };
}

export function question(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    kind: 'grammar',
    context: '',
    stem: 'Han sa at han ___ syk.',
    options: [
      option({ id: 'a', text: 'er', why: 'Etter «sa» flyttes presens til preteritum.' }),
      option({ id: 'b', text: 'var', correct: true }),
      option({ id: 'c', text: 'har vært' }),
    ],
    why: 'Indirekte tale i fortid: presens blir preteritum.',
    ...overrides,
  };
}

export function content(overrides: Partial<MultipleChoiceContent> = {}): MultipleChoiceContent {
  return {
    title: 'Indirekte tale — B1',
    instruction: '',
    questions: [question()],
    settings: settings(),
    ...overrides,
  };
}

export function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}
