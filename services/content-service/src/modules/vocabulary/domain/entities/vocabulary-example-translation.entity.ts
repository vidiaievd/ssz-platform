import { randomUUID } from 'crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';

interface VocabularyExampleTranslationProps {
  vocabularyUsageExampleId: string;
  translationLanguage: string;
  translatedText: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateVocabularyExampleTranslationProps {
  vocabularyUsageExampleId: string;
  translationLanguage: string;
  translatedText: string;
}

export class VocabularyExampleTranslationEntity extends Entity<string> {
  private constructor(
    id: string,
    private props: VocabularyExampleTranslationProps,
  ) {
    super(id);
  }

  get vocabularyUsageExampleId(): string { return this.props.vocabularyUsageExampleId; }
  get translationLanguage(): string { return this.props.translationLanguage; }
  get translatedText(): string { return this.props.translatedText; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  static create(p: CreateVocabularyExampleTranslationProps, id?: string): VocabularyExampleTranslationEntity {
    const now = new Date();
    return new VocabularyExampleTranslationEntity(id ?? randomUUID(), {
      vocabularyUsageExampleId: p.vocabularyUsageExampleId,
      translationLanguage: p.translationLanguage,
      translatedText: p.translatedText,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(id: string, props: VocabularyExampleTranslationProps): VocabularyExampleTranslationEntity {
    return new VocabularyExampleTranslationEntity(id, props);
  }

  updateText(translatedText: string): void {
    this.props.translatedText = translatedText;
    this.props.updatedAt = new Date();
  }
}
