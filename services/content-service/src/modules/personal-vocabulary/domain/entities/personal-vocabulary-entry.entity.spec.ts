import {
  PersonalVocabularyEntryEntity,
  type EntryContext,
} from './personal-vocabulary-entry.entity.js';
import { SurfaceForm } from '../value-objects/surface-form.vo.js';

const context = (sentence: string): EntryContext => ({
  sentence,
  variantId: null,
  paragraphIndex: 0,
  charStart: 3,
});

function capture(ctx: EntryContext | null) {
  return PersonalVocabularyEntryEntity.capture({
    userId: 'u1',
    targetLanguage: 'nb',
    vocabularyItemId: 'item-1',
    surfaceForm: SurfaceForm.from('kommer').value,
    context: ctx,
  });
}

describe('PersonalVocabularyEntryEntity.recapture', () => {
  it('keeps the place the word was first met', () => {
    const entry = capture(context('Bartek kommer fra Polen.'));
    expect(entry.recapture(context('Hun kommer i morgen.'))).toBe(false);
    expect(entry.context?.sentence).toBe('Bartek kommer fra Polen.');
  });

  it('takes a context when it had none', () => {
    const entry = capture(null);
    expect(entry.recapture(context('Hun kommer i morgen.'))).toBe(true);
    expect(entry.context?.sentence).toBe('Hun kommer i morgen.');
  });

  it('only the owner owns it', () => {
    const entry = capture(null);
    expect(entry.belongsTo('u1')).toBe(true);
    expect(entry.belongsTo('u2')).toBe(false);
  });
});
