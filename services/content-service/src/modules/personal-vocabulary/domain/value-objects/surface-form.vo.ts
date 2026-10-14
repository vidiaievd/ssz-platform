import { Result } from '../../../../shared/kernel/result.js';
import { PersonalVocabularyDomainError } from '../exceptions/personal-vocabulary-domain.exceptions.js';

/** Same cap as vocabulary_items.word — a surface form may become an item's word. */
const MAX_LENGTH = 200;

// Quotes, dashes and full stops a tap or a selection drags in at the edges. Inner
// hyphens and apostrophes («e-post», «bil'n») stay.
const EDGE_PUNCTUATION = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu;
// A dialogue dash or an opening quote before a sentence's first word.
const LEADING_PUNCTUATION = /^[\p{P}\p{S}\s]+/u;

/**
 * The word as the student selected it in a text — «kommer», not «komme». One word only
 * in the first version of plan 75 (decision Q2): a phrase is refused rather than stored
 * as a word it is not.
 */
export class SurfaceForm {
  private constructor(readonly value: string) {}

  static from(raw: string): Result<SurfaceForm, PersonalVocabularyDomainError> {
    const value = raw.normalize('NFC').trim().replace(EDGE_PUNCTUATION, '');
    if (value.length === 0 || value.length > MAX_LENGTH || /\s/u.test(value)) {
      return Result.fail(PersonalVocabularyDomainError.INVALID_SURFACE_FORM);
    }
    return Result.ok(new SurfaceForm(value));
  }

  /** What the catalogue is searched by: case-insensitive, as the reader's tokenizer matches. */
  get matchKey(): string {
    return this.value.toLocaleLowerCase();
  }

  /**
   * The form to store as a new word. A word that opens its sentence is capitalised by
   * position, not by nature — «Selv» there is «selv» — so its first letter is lowered.
   * Anywhere else a capital is kept: mid-sentence it marks a name («Norge»). A name that
   * opens a sentence loses its capital too; the student can correct that, and it is the
   * rarer case.
   */
  dictionaryFormIn(sentence: string | null): string {
    const first = this.value.charAt(0);
    const rest = this.value.slice(1);
    const capitalised = first !== first.toLocaleLowerCase() && rest === rest.toLocaleLowerCase();
    if (!capitalised || sentence === null) return this.value;

    const opening = sentence.trimStart().replace(LEADING_PUNCTUATION, '');
    return opening.startsWith(this.value) ? first.toLocaleLowerCase() + rest : this.value;
  }
}
