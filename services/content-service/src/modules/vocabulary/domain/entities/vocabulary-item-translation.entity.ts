import { randomUUID } from 'crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';

interface VocabularyItemTranslationProps {
  vocabularyItemId: string;
  translationLanguage: string;
  primaryTranslation: string;
  alternativeTranslations: string[];
  definition: string | null;
  usageNotes: string | null;
  falseFriendWarning: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string;
  lastEditedByUserId: string;
}

export interface CreateVocabularyItemTranslationProps {
  vocabularyItemId: string;
  translationLanguage: string;
  primaryTranslation: string;
  alternativeTranslations?: string[];
  definition?: string;
  usageNotes?: string;
  falseFriendWarning?: string;
  createdByUserId: string;
}

export interface UpdateVocabularyItemTranslationProps {
  primaryTranslation?: string;
  alternativeTranslations?: string[];
  definition?: string | null;
  usageNotes?: string | null;
  falseFriendWarning?: string | null;
}

export class VocabularyItemTranslationEntity extends Entity<string> {
  private constructor(
    id: string,
    private props: VocabularyItemTranslationProps,
  ) {
    super(id);
  }

  get vocabularyItemId(): string {
    return this.props.vocabularyItemId;
  }
  get translationLanguage(): string {
    return this.props.translationLanguage;
  }
  get primaryTranslation(): string {
    return this.props.primaryTranslation;
  }
  get alternativeTranslations(): string[] {
    return this.props.alternativeTranslations;
  }
  get definition(): string | null {
    return this.props.definition;
  }
  get usageNotes(): string | null {
    return this.props.usageNotes;
  }
  get falseFriendWarning(): string | null {
    return this.props.falseFriendWarning;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get createdByUserId(): string {
    return this.props.createdByUserId;
  }
  get lastEditedByUserId(): string {
    return this.props.lastEditedByUserId;
  }

  static create(
    p: CreateVocabularyItemTranslationProps,
    id?: string,
  ): VocabularyItemTranslationEntity {
    if (p.primaryTranslation.trim().length === 0) {
      throw new Error('Primary translation must not be blank');
    }
    const now = new Date();
    return new VocabularyItemTranslationEntity(id ?? randomUUID(), {
      vocabularyItemId: p.vocabularyItemId,
      translationLanguage: p.translationLanguage,
      primaryTranslation: p.primaryTranslation,
      alternativeTranslations: p.alternativeTranslations ?? [],
      definition: p.definition ?? null,
      usageNotes: p.usageNotes ?? null,
      falseFriendWarning: p.falseFriendWarning ?? null,
      createdAt: now,
      updatedAt: now,
      createdByUserId: p.createdByUserId,
      lastEditedByUserId: p.createdByUserId,
    });
  }

  static reconstitute(
    id: string,
    props: VocabularyItemTranslationProps,
  ): VocabularyItemTranslationEntity {
    return new VocabularyItemTranslationEntity(id, props);
  }

  update(changes: UpdateVocabularyItemTranslationProps, editorUserId: string): void {
    if (changes.primaryTranslation !== undefined) {
      if (changes.primaryTranslation.trim().length === 0) {
        throw new Error('Primary translation must not be blank');
      }
      this.props.primaryTranslation = changes.primaryTranslation;
    }
    if (changes.alternativeTranslations !== undefined) {
      this.props.alternativeTranslations = changes.alternativeTranslations;
    }
    if ('definition' in changes) {
      this.props.definition = changes.definition ?? null;
    }
    if ('usageNotes' in changes) {
      this.props.usageNotes = changes.usageNotes ?? null;
    }
    if ('falseFriendWarning' in changes) {
      this.props.falseFriendWarning = changes.falseFriendWarning ?? null;
    }
    this.props.lastEditedByUserId = editorUserId;
    this.props.updatedAt = new Date();
  }
}
