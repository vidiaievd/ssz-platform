// Plan 55 §3.1 — the axes themselves.

import { describe, expect, it } from 'vitest';

import { FOCUSES, isFocus, isSkill, orderFocuses, orderSkills, parseFocuses, parseSkills, SKILLS } from './model.js';

describe('the axes', () => {
  it('are the four CEFR channels of CanDoSkill, and nothing else', () => {
    // A second, parallel vocabulary would make the coverage report and can-do progress
    // permanently incomparable.
    expect(SKILLS).toEqual(['listening', 'reading', 'spoken', 'written']);
  });

  it('keep grammar out of the skill axis', () => {
    expect(SKILLS as readonly string[]).not.toContain('grammar');
    expect(FOCUSES).toContain('grammar');
  });
});

describe('ordering', () => {
  it('puts any input into canonical order and deduplicates it', () => {
    expect(orderSkills(['written', 'listening', 'written'])).toEqual(['listening', 'written']);
    expect(orderFocuses(['pragmatics', 'grammar'])).toEqual(['grammar', 'pragmatics']);
  });
});

describe('parsing untrusted input', () => {
  it('keeps the members it recognises and drops the rest', () => {
    expect(parseSkills(['reading', 'swimming', null, 3])).toEqual(['reading']);
    expect(parseFocuses('grammar')).toEqual([]);
    expect(parseSkills(undefined)).toEqual([]);
  });

  it('guards', () => {
    expect(isSkill('reading')).toBe(true);
    expect(isSkill('Reading')).toBe(false);
    expect(isFocus('orthography')).toBe(true);
  });
});
