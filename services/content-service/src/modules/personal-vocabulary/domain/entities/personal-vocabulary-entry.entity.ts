import { randomUUID } from 'node:crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';
import type { SurfaceForm } from '../value-objects/surface-form.vo.js';

/** Where in a text the word was found. Every part is optional: a client may know only some. */
export interface EntryContext {
  sentence: string | null;
  variantId: string | null;
  paragraphIndex: number | null;
  charStart: number | null;
}

interface PersonalVocabularyEntryProps {
  userId: string;
  targetLanguage: string;
  vocabularyItemId: string;
  surfaceForm: string;
  context: EntryContext | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * One word in a student's own dictionary (plan 75). It points at a vocabulary item — a
 * catalogue one or one of the student's personal list — and remembers where it was met.
 *
 * Whether the word still waits for a translation is not part of the entry: it is a fact
 * about the item, read when asked, so a translation added anywhere resolves it at once.
 */
export class PersonalVocabularyEntryEntity extends Entity<string> {
  private constructor(
    id: string,
    private props: PersonalVocabularyEntryProps,
  ) {
    super(id);
  }

  get userId(): string {
    return this.props.userId;
  }
  get targetLanguage(): string {
    return this.props.targetLanguage;
  }
  get vocabularyItemId(): string {
    return this.props.vocabularyItemId;
  }
  get surfaceForm(): string {
    return this.props.surfaceForm;
  }
  get context(): EntryContext | null {
    return this.props.context;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  static capture(params: {
    userId: string;
    targetLanguage: string;
    vocabularyItemId: string;
    surfaceForm: SurfaceForm;
    context: EntryContext | null;
  }): PersonalVocabularyEntryEntity {
    const now = new Date();
    return new PersonalVocabularyEntryEntity(randomUUID(), {
      userId: params.userId,
      targetLanguage: params.targetLanguage,
      vocabularyItemId: params.vocabularyItemId,
      surfaceForm: params.surfaceForm.value,
      context: params.context,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(
    id: string,
    props: PersonalVocabularyEntryProps,
  ): PersonalVocabularyEntryEntity {
    return new PersonalVocabularyEntryEntity(id, props);
  }

  belongsTo(userId: string): boolean {
    return this.props.userId === userId;
  }

  /**
   * The same word captured again. The first place it was met stays — that is the context
   * the student chose to keep — and only an entry that had none takes the new one.
   * Returns whether anything changed.
   */
  recapture(context: EntryContext | null): boolean {
    if (this.props.context !== null || context === null) return false;
    this.props.context = context;
    this.props.updatedAt = new Date();
    return true;
  }
}
