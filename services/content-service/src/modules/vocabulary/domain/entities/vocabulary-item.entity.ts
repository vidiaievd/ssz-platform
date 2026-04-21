import { randomUUID } from 'crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { PartOfSpeech } from '../value-objects/part-of-speech.vo.js';
import { Register } from '../value-objects/register.vo.js';
import { VocabularyDomainError } from '../exceptions/vocabulary-domain.exceptions.js';
import { VocabularyItemCreatedEvent } from '../events/vocabulary-item-created.event.js';
import { VocabularyItemUpdatedEvent } from '../events/vocabulary-item-updated.event.js';
import { VocabularyItemDeletedEvent } from '../events/vocabulary-item-deleted.event.js';
import { VocabularyItemTranslationEntity } from './vocabulary-item-translation.entity.js';
import { VocabularyUsageExampleEntity } from './vocabulary-usage-example.entity.js';

interface VocabularyItemProps {
  vocabularyListId: string;
  word: string;
  position: number;
  partOfSpeech: PartOfSpeech | null;
  ipaTranscription: string | null;
  pronunciationAudioMediaId: string | null;
  grammaticalProperties: Record<string, unknown> | null;
  register: Register | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  translations: VocabularyItemTranslationEntity[];
  usageExamples: VocabularyUsageExampleEntity[];
}

export interface CreateVocabularyItemProps {
  vocabularyListId: string;
  word: string;
  position: number;
  partOfSpeech?: PartOfSpeech;
  ipaTranscription?: string;
  pronunciationAudioMediaId?: string;
  grammaticalProperties?: Record<string, unknown>;
  register?: Register;
  notes?: string;
}

export interface UpdateVocabularyItemProps {
  word?: string;
  partOfSpeech?: PartOfSpeech | null;
  ipaTranscription?: string | null;
  pronunciationAudioMediaId?: string | null;
  grammaticalProperties?: Record<string, unknown> | null;
  register?: Register | null;
  notes?: string | null;
}

export class VocabularyItemEntity extends AggregateRoot {
  private constructor(
    id: string,
    private props: VocabularyItemProps,
  ) {
    super(id);
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  get vocabularyListId(): string {
    return this.props.vocabularyListId;
  }
  get word(): string {
    return this.props.word;
  }
  get position(): number {
    return this.props.position;
  }
  get partOfSpeech(): PartOfSpeech | null {
    return this.props.partOfSpeech;
  }
  get ipaTranscription(): string | null {
    return this.props.ipaTranscription;
  }
  get pronunciationAudioMediaId(): string | null {
    return this.props.pronunciationAudioMediaId;
  }
  get grammaticalProperties(): Record<string, unknown> | null {
    return this.props.grammaticalProperties;
  }
  get register(): Register | null {
    return this.props.register;
  }
  get notes(): string | null {
    return this.props.notes;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }
  get translations(): VocabularyItemTranslationEntity[] {
    return this.props.translations;
  }
  get usageExamples(): VocabularyUsageExampleEntity[] {
    return this.props.usageExamples;
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  static create(
    p: CreateVocabularyItemProps,
    id?: string,
  ): Result<VocabularyItemEntity, VocabularyDomainError> {
    if (p.word.trim().length === 0) {
      return Result.fail(VocabularyDomainError.EMPTY_WORD);
    }

    const now = new Date();
    const entity = new VocabularyItemEntity(id ?? randomUUID(), {
      vocabularyListId: p.vocabularyListId,
      word: p.word,
      position: p.position,
      partOfSpeech: p.partOfSpeech ?? null,
      ipaTranscription: p.ipaTranscription ?? null,
      pronunciationAudioMediaId: p.pronunciationAudioMediaId ?? null,
      grammaticalProperties: p.grammaticalProperties ?? null,
      register: p.register ?? null,
      notes: p.notes ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      translations: [],
      usageExamples: [],
    });

    entity.addDomainEvent(
      new VocabularyItemCreatedEvent({
        itemId: entity.id,
        listId: p.vocabularyListId,
        word: p.word,
      }),
    );

    return Result.ok(entity);
  }

  static reconstitute(
    id: string,
    props: Omit<VocabularyItemProps, 'translations' | 'usageExamples'>,
    translations: VocabularyItemTranslationEntity[],
    usageExamples: VocabularyUsageExampleEntity[],
  ): VocabularyItemEntity {
    return new VocabularyItemEntity(id, { ...props, translations, usageExamples });
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  update(changes: UpdateVocabularyItemProps): Result<void, VocabularyDomainError> {
    if (this.props.deletedAt !== null) {
      return Result.fail(VocabularyDomainError.ITEM_ALREADY_DELETED);
    }

    if (changes.word !== undefined && changes.word.trim().length === 0) {
      return Result.fail(VocabularyDomainError.EMPTY_WORD);
    }

    const updatedFields: string[] = [];

    if (changes.word !== undefined && changes.word !== this.props.word) {
      this.props.word = changes.word;
      updatedFields.push('word');
    }
    if ('partOfSpeech' in changes && changes.partOfSpeech !== this.props.partOfSpeech) {
      this.props.partOfSpeech = changes.partOfSpeech ?? null;
      updatedFields.push('partOfSpeech');
    }
    if ('ipaTranscription' in changes && changes.ipaTranscription !== this.props.ipaTranscription) {
      this.props.ipaTranscription = changes.ipaTranscription ?? null;
      updatedFields.push('ipaTranscription');
    }
    if (
      'pronunciationAudioMediaId' in changes &&
      changes.pronunciationAudioMediaId !== this.props.pronunciationAudioMediaId
    ) {
      this.props.pronunciationAudioMediaId = changes.pronunciationAudioMediaId ?? null;
      updatedFields.push('pronunciationAudioMediaId');
    }
    if ('grammaticalProperties' in changes) {
      this.props.grammaticalProperties = changes.grammaticalProperties ?? null;
      updatedFields.push('grammaticalProperties');
    }
    if ('register' in changes && changes.register !== this.props.register) {
      this.props.register = changes.register ?? null;
      updatedFields.push('register');
    }
    if ('notes' in changes && changes.notes !== this.props.notes) {
      this.props.notes = changes.notes ?? null;
      updatedFields.push('notes');
    }

    if (updatedFields.length > 0) {
      this.props.updatedAt = new Date();
      this.addDomainEvent(
        new VocabularyItemUpdatedEvent({
          itemId: this.id,
          listId: this.props.vocabularyListId,
          updatedFields,
        }),
      );
    }

    return Result.ok();
  }

  softDelete(): Result<void, VocabularyDomainError> {
    if (this.props.deletedAt !== null) {
      return Result.fail(VocabularyDomainError.ITEM_ALREADY_DELETED);
    }

    this.props.deletedAt = new Date();
    this.props.updatedAt = new Date();
    this.addDomainEvent(
      new VocabularyItemDeletedEvent({ itemId: this.id, listId: this.props.vocabularyListId }),
    );

    return Result.ok();
  }

  /**
   * Updates position — called by the reorder handler only.
   * Does not emit a domain event; the handler emits after the batch is written.
   */
  changePosition(newPosition: number): void {
    this.props.position = newPosition;
    this.props.updatedAt = new Date();
  }
}
