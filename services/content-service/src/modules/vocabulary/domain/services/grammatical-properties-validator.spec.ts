import { GrammaticalPropertiesValidatorService } from './grammatical-properties-validator.service.js';
import { VocabularyDomainError } from '../exceptions/vocabulary-domain.exceptions.js';

describe('GrammaticalPropertiesValidatorService', () => {
  const validator = new GrammaticalPropertiesValidatorService();

  // ── null / undefined ───────────────────────────────────────────────────────

  it('accepts null (field is optional)', () => {
    const result = validator.validate('no', null);
    expect(result.isOk).toBe(true);
  });

  it('accepts undefined (field is optional)', () => {
    const result = validator.validate('no', undefined);
    expect(result.isOk).toBe(true);
  });

  // ── Norwegian noun ─────────────────────────────────────────────────────────

  it('accepts a valid Norwegian noun entry', () => {
    const result = validator.validate('no', {
      gender: 'masculine',
      plural_form: 'hunder',
      definite_singular: 'hunden',
      definite_plural: 'hundene',
    });
    expect(result.isOk).toBe(true);
  });

  // ── Norwegian verb ─────────────────────────────────────────────────────────

  it('accepts a valid Norwegian verb entry', () => {
    const result = validator.validate('no', {
      verb_class: 'weak_1',
      present_tense: 'kjører',
      past_tense: 'kjørte',
      perfect_tense: 'kjørt',
    });
    expect(result.isOk).toBe(true);
  });

  // ── Invalid enum value ─────────────────────────────────────────────────────

  it('rejects an invalid enum value for a known language', () => {
    const result = validator.validate('no', { gender: 'invalid_value' });
    expect(result.isOk).toBe(false);
    expect(result.error).toBe(VocabularyDomainError.INVALID_GRAMMATICAL_PROPERTIES);
  });

  // ── Unknown key ───────────────────────────────────────────────────────────

  it('rejects an unknown key for a known language', () => {
    const result = validator.validate('no', { unknown_key: 'x' });
    expect(result.isOk).toBe(false);
    expect(result.error).toBe(VocabularyDomainError.INVALID_GRAMMATICAL_PROPERTIES);
  });

  // ── Unknown language — permissive ─────────────────────────────────────────

  it('accepts any object for an unknown language (permissive fallback)', () => {
    const result = validator.validate('xx', {
      completely_arbitrary_key: 'some_value',
      another: 123,
    });
    expect(result.isOk).toBe(true);
  });

  // ── Non-object value ──────────────────────────────────────────────────────

  it('rejects a non-object value (string)', () => {
    const result = validator.validate('no', 'not-an-object');
    expect(result.isOk).toBe(false);
    expect(result.error).toBe(VocabularyDomainError.INVALID_GRAMMATICAL_PROPERTIES);
  });

  it('rejects an array', () => {
    const result = validator.validate('no', ['noun', 'verb']);
    expect(result.isOk).toBe(false);
    expect(result.error).toBe(VocabularyDomainError.INVALID_GRAMMATICAL_PROPERTIES);
  });

  // ── English ───────────────────────────────────────────────────────────────

  it('accepts a valid English entry', () => {
    const result = validator.validate('en', {
      verb_forms: 'go, went, gone',
      irregular: true,
    });
    expect(result.isOk).toBe(true);
  });

  it('rejects a wrong type for English boolean field', () => {
    const result = validator.validate('en', { irregular: 'yes' });
    expect(result.isOk).toBe(false);
    expect(result.error).toBe(VocabularyDomainError.INVALID_GRAMMATICAL_PROPERTIES);
  });
});
