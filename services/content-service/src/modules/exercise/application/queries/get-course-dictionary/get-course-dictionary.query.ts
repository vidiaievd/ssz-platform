import type { DictionaryPartOfSpeech } from '../../../domain/repositories/course-dictionary.reader.interface.js';

export class GetCourseDictionaryQuery {
  constructor(
    public readonly exerciseId: string,
    public readonly pos?: DictionaryPartOfSpeech,
    /** The author's interface language, for the gloss. */
    public readonly glossLanguage?: string,
  ) {}
}
