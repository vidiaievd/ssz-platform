import { describe, expect, it } from 'vitest';

import { demoAnswer } from './demo.js';
import { emptyContent } from './model.js';
import { EMPTY_PACK, instructionFor, packFor, packOf } from './presets.js';

describe('language packs (AC-X8)', () => {
  it('finds the Norwegian pack by any of its codes', () => {
    expect(packFor('nb')?.fold['å']).toBe('aa');
    expect(packFor('nb-NO')).toBe(packFor('no'));
  });

  it('an unknown language has no pack, an empty instruction and nothing folds', () => {
    expect(packFor('fi')).toBeNull();
    expect(instructionFor('fi')).toBe('');
    expect(packOf('fi')).toBe(EMPTY_PACK);
  });

  it('a new document carries no Norwegian unless its language asks for it', () => {
    const doc = emptyContent('');
    expect(JSON.stringify(doc)).not.toMatch(/[æøå]/i);
  });
});

describe('demoAnswer', () => {
  it('rewrites with the pack, drops a word of a long sentence, lower-cases', () => {
    expect(
      demoAnswer('På kjøkkenet står det en skje ved siden av tallerkenen.', packOf('nb')),
    ).toBe('paa sjøkkenet staar det en sje ved siden talerkenen.');
  });

  it('without a pack only drops a word and lower-cases', () => {
    expect(demoAnswer('Hytta ligger mellom fjellet og vannet.', EMPTY_PACK)).toBe(
      'hytta ligger mellom fjellet vannet.',
    );
  });
});
