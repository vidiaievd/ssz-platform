import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Result } from '../../../../../shared/kernel/result.js';
import type { PartOfSpeech } from '../../../../vocabulary/domain/value-objects/part-of-speech.vo.js';
import { PersonalVocabularyDomainError } from '../../../domain/exceptions/personal-vocabulary-domain.exceptions.js';
import { SurfaceForm } from '../../../domain/value-objects/surface-form.vo.js';
import {
  PERSONAL_VOCABULARY_READER,
  type IPersonalVocabularyReader,
  type PersonalWordView,
} from '../../../domain/repositories/personal-vocabulary.reader.interface.js';
import { LookupWordQuery } from './lookup-word.query.js';

export interface LookupWordResult {
  /** The form as it will be stored. */
  surfaceForm: string;
  /** Already in the student's dictionary — the client offers no second «add». */
  entry: PersonalWordView | null;
  /** What the catalogue knows, to fill the «add» sheet before anything is saved. */
  catalog: { word: string; partOfSpeech: PartOfSpeech | null; translation: string | null } | null;
}

/** What the «add to my words» sheet shows before the student confirms. Writes nothing. */
@QueryHandler(LookupWordQuery)
export class LookupWordHandler implements IQueryHandler<
  LookupWordQuery,
  Result<LookupWordResult, PersonalVocabularyDomainError>
> {
  constructor(
    @Inject(PERSONAL_VOCABULARY_READER)
    private readonly reader: IPersonalVocabularyReader,
  ) {}

  async execute(
    query: LookupWordQuery,
  ): Promise<Result<LookupWordResult, PersonalVocabularyDomainError>> {
    const formResult = SurfaceForm.from(query.surfaceForm);
    if (formResult.isFail) return Result.fail(formResult.error);
    const form = formResult.value;

    const match = await this.reader.findCatalogMatch(
      form.matchKey,
      query.targetLanguage,
      query.translationLanguage,
      query.userId,
    );

    // A personal dictionary is hundreds of words, not thousands: scanning it is cheaper
    // than a second index on lowered forms.
    const words = await this.reader.listWords(query.userId, {
      translationLanguage: query.translationLanguage,
      targetLanguage: query.targetLanguage,
    });
    const keys = new Set([form.matchKey, match?.word.toLocaleLowerCase()].filter(Boolean));
    const entry =
      words.find(
        (w) =>
          w.vocabularyItemId === match?.itemId ||
          keys.has(w.surfaceForm.toLocaleLowerCase()) ||
          keys.has(w.word.toLocaleLowerCase()),
      ) ?? null;

    return Result.ok({
      surfaceForm: form.value,
      entry,
      catalog: match
        ? { word: match.word, partOfSpeech: match.partOfSpeech, translation: match.translation }
        : null,
    });
  }
}
