// README, "Feedback resolution (`ssFbFor`)": override → kind default → the rule, plus the
// escalation from attempt 2.

import { describe, expect, it } from 'vitest';

import { chunk, MAIN_FIELDS, row } from './fixtures.test-support.js';
import { bannerFor, feedbackFor } from './feedback.js';
import { grade, type Placement } from './grading.js';
import { DEFAULT_SETTINGS } from './model.js';

const settings = DEFAULT_SETTINGS;
const correct: Placement = { F: ['c1'], v: ['c2'], n: ['c3'], a: ['c4'], V: ['c5'], N: ['c6'] };

describe('feedbackFor', () => {
  it('prefers the author’s note on the chunk', () => {
    const r = row({ fb: { c1: 'Forfeltet holder ett ledd.' } });

    expect(feedbackFor(r, 'c1', 'field', settings, 1)).toMatchObject({
      source: 'override',
      text: 'Forfeltet holder ett ledd.',
    });
  });

  it('falls to a code — never English prose — for order and extra', () => {
    expect(feedbackFor(row(), 'c1', 'order', settings, 1)).toMatchObject({ source: 'default', code: 'order', text: '' });
    expect(feedbackFor(row(), 'x1', 'extra', settings, 1)).toMatchObject({ source: 'default', code: 'extra', text: '' });
  });

  it('falls to the rule for a wrong field, because naming it teaches nothing', () => {
    expect(feedbackFor(row(), 'c1', 'field', settings, 1)).toMatchObject({
      source: 'why',
      text: 'Det finitte verbet står på plass to.',
    });
  });

  it('ignores a blank override', () => {
    expect(feedbackFor(row({ fb: { c1: '   ' } }), 'c1', 'field', settings, 1).source).toBe('why');
  });

  it('appends the rule as a hint from attempt 2, and not before', () => {
    const r = row({ fb: { c1: 'Forfeltet holder ett ledd.' } });

    expect(feedbackFor(r, 'c1', 'field', settings, 1).hint).toBe('');
    expect(feedbackFor(r, 'c1', 'field', settings, 2).hint).toBe('Det finitte verbet står på plass to.');
  });

  it('never escalates when the author switched it off', () => {
    const off = { ...settings, hintAfterMistake: false };

    expect(feedbackFor(row(), 'c1', 'order', off, 3).hint).toBe('');
  });
});

describe('bannerFor', () => {
  it('shows the rule on success', () => {
    const marks = grade(row(), MAIN_FIELDS, correct, settings);

    expect(bannerFor(row(), marks, settings, 1)).toMatchObject({ source: 'why', hint: '' });
  });

  it('reports the mistake nearest the start of the sentence', () => {
    const r = row({ fb: { c1: 'Første feil.', c6: 'Siste feil.' } });
    const placement: Placement = { F: ['c6'], v: ['c2'], n: ['c3'], a: ['c4'], V: ['c5'], N: ['c1'] };
    const marks = grade(r, MAIN_FIELDS, placement, settings);

    expect(bannerFor(r, marks, settings, 1)).toMatchObject({ text: 'Første feil.' });
  });

  it('reports a distractor when nothing of the sentence itself is wrong', () => {
    const r = row({ extras: [{ id: 'x1', text: 'blir' }] });
    const marks = grade(r, MAIN_FIELDS, { ...correct, v: ['c2', 'x1'] }, settings);

    expect(bannerFor(r, marks, settings, 1)).toMatchObject({ source: 'default', code: 'extra' });
  });

  it('falls back to the rule when what is wrong is an empty field', () => {
    const marks = grade(row(), MAIN_FIELDS, { ...correct, v: [] }, settings);

    expect(bannerFor(row(), marks, settings, 1)).toMatchObject({ source: 'why' });
  });

  it('says nothing about an untouched board', () => {
    const empty = row({ chunks: [chunk('c1', 'Jeg', 'n')], text: 'Jeg' });
    const marks = grade(empty, [{ id: 'n', short: 'n', label: 'Subjekt', hint: '', optional: true }], { n: ['c1'] }, settings);

    expect(bannerFor(empty, marks, settings, 1)).toMatchObject({ source: 'why' });
  });
});
