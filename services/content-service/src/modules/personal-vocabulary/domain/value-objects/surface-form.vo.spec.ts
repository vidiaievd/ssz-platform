import { SurfaceForm } from './surface-form.vo.js';
import { PersonalVocabularyDomainError } from '../exceptions/personal-vocabulary-domain.exceptions.js';

describe('SurfaceForm', () => {
  it('trims the punctuation a tap drags in at the edges', () => {
    expect(SurfaceForm.from(' «kommer», ').value.value).toBe('kommer');
    expect(SurfaceForm.from('Polen.').value.value).toBe('Polen');
  });

  it('keeps inner hyphens and apostrophes', () => {
    expect(SurfaceForm.from('e-post').value.value).toBe('e-post');
    expect(SurfaceForm.from("bil'n").value.value).toBe("bil'n");
  });

  it('matches case-insensitively, letters outside ASCII included', () => {
    expect(SurfaceForm.from('Blå').value.matchKey).toBe('blå');
    expect(SurfaceForm.from('ØRET').value.matchKey).toBe('øret');
  });

  it.each([[''], ['  '], ['—'], ['ta seg av'], ['x'.repeat(201)]])('refuses %p', (raw) => {
    const result = SurfaceForm.from(raw);
    expect(result.isFail).toBe(true);
    expect(result.error).toBe(PersonalVocabularyDomainError.INVALID_SURFACE_FORM);
  });
});

describe('SurfaceForm.dictionaryFormIn', () => {
  const form = (raw: string) => SurfaceForm.from(raw).value;

  it('lowers the capital a sentence gives its first word', () => {
    expect(form('Selv').dictionaryFormIn('Selv om det regner, går vi.')).toBe('selv');
    expect(form('Kanskje').dictionaryFormIn('– «Kanskje i morgen.»')).toBe('kanskje');
  });

  it('keeps a capital in the middle of a sentence', () => {
    expect(form('Norge').dictionaryFormIn('Hun bor i Norge.')).toBe('Norge');
  });

  it('keeps the form when there is no sentence, or it is all capitals', () => {
    expect(form('Selv').dictionaryFormIn(null)).toBe('Selv');
    expect(form('NAV').dictionaryFormIn('NAV hjelper deg.')).toBe('NAV');
  });
});
