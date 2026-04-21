import { randomUUID } from 'crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';
import { VocabularyExampleTranslationEntity } from './vocabulary-example-translation.entity.js';

interface VocabularyUsageExampleProps {
  vocabularyItemId: string;
  exampleText: string;
  position: number;
  audioMediaId: string | null;
  contextNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  translations: VocabularyExampleTranslationEntity[];
}

export interface CreateVocabularyUsageExampleProps {
  vocabularyItemId: string;
  exampleText: string;
  position: number;
  audioMediaId?: string;
  contextNote?: string;
}

export interface UpdateVocabularyUsageExampleProps {
  exampleText?: string;
  audioMediaId?: string | null;
  contextNote?: string | null;
}

export class VocabularyUsageExampleEntity extends Entity<string> {
  private constructor(
    id: string,
    private props: VocabularyUsageExampleProps,
  ) {
    super(id);
  }

  get vocabularyItemId(): string {
    return this.props.vocabularyItemId;
  }
  get exampleText(): string {
    return this.props.exampleText;
  }
  get position(): number {
    return this.props.position;
  }
  get audioMediaId(): string | null {
    return this.props.audioMediaId;
  }
  get contextNote(): string | null {
    return this.props.contextNote;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get translations(): VocabularyExampleTranslationEntity[] {
    return this.props.translations;
  }

  static create(p: CreateVocabularyUsageExampleProps, id?: string): VocabularyUsageExampleEntity {
    if (p.exampleText.trim().length === 0) {
      throw new Error('Example text must not be blank');
    }
    const now = new Date();
    return new VocabularyUsageExampleEntity(id ?? randomUUID(), {
      vocabularyItemId: p.vocabularyItemId,
      exampleText: p.exampleText,
      position: p.position,
      audioMediaId: p.audioMediaId ?? null,
      contextNote: p.contextNote ?? null,
      createdAt: now,
      updatedAt: now,
      translations: [],
    });
  }

  static reconstitute(
    id: string,
    props: Omit<VocabularyUsageExampleProps, 'translations'>,
    translations: VocabularyExampleTranslationEntity[],
  ): VocabularyUsageExampleEntity {
    return new VocabularyUsageExampleEntity(id, { ...props, translations });
  }

  update(changes: UpdateVocabularyUsageExampleProps): void {
    if (changes.exampleText !== undefined) {
      if (changes.exampleText.trim().length === 0) {
        throw new Error('Example text must not be blank');
      }
      this.props.exampleText = changes.exampleText;
    }
    if ('audioMediaId' in changes) {
      this.props.audioMediaId = changes.audioMediaId ?? null;
    }
    if ('contextNote' in changes) {
      this.props.contextNote = changes.contextNote ?? null;
    }
    this.props.updatedAt = new Date();
  }
}
