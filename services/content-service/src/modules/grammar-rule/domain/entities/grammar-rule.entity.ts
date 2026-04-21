import { randomUUID } from 'crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { DifficultyLevel } from '../../../container/domain/value-objects/difficulty-level.vo.js';
import {
  Visibility,
  getValidVisibilities,
} from '../../../container/domain/value-objects/visibility.vo.js';
import { GrammarTopic } from '../value-objects/grammar-topic.vo.js';
import { GrammarRuleDomainError } from '../exceptions/grammar-rule-domain.exceptions.js';
import { GrammarRuleCreatedEvent } from '../events/grammar-rule-created.event.js';
import { GrammarRuleUpdatedEvent } from '../events/grammar-rule-updated.event.js';
import { GrammarRuleDeletedEvent } from '../events/grammar-rule-deleted.event.js';

interface GrammarRuleProps {
  slug: string | null;
  targetLanguage: string;
  difficultyLevel: DifficultyLevel;
  topic: GrammarTopic;
  subtopic: string | null;
  title: string;
  description: string | null;
  ownerUserId: string;
  ownerSchoolId: string | null;
  visibility: Visibility;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateGrammarRuleProps {
  targetLanguage: string;
  difficultyLevel: DifficultyLevel;
  topic: GrammarTopic;
  subtopic?: string;
  title: string;
  description?: string;
  ownerUserId: string;
  ownerSchoolId?: string;
  visibility: Visibility;
}

export interface UpdateGrammarRuleProps {
  title?: string;
  description?: string | null;
  difficultyLevel?: DifficultyLevel;
  topic?: GrammarTopic;
  subtopic?: string | null;
  visibility?: Visibility;
}

export class GrammarRuleEntity extends AggregateRoot {
  private constructor(
    id: string,
    private props: GrammarRuleProps,
  ) {
    super(id);
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  get slug(): string | null {
    return this.props.slug;
  }
  get targetLanguage(): string {
    return this.props.targetLanguage;
  }
  get difficultyLevel(): DifficultyLevel {
    return this.props.difficultyLevel;
  }
  get topic(): GrammarTopic {
    return this.props.topic;
  }
  get subtopic(): string | null {
    return this.props.subtopic;
  }
  get title(): string {
    return this.props.title;
  }
  get description(): string | null {
    return this.props.description;
  }
  get ownerUserId(): string {
    return this.props.ownerUserId;
  }
  get ownerSchoolId(): string | null {
    return this.props.ownerSchoolId;
  }
  get visibility(): Visibility {
    return this.props.visibility;
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

  // ── Factory ───────────────────────────────────────────────────────────────

  static create(
    p: CreateGrammarRuleProps,
    id?: string,
  ): Result<GrammarRuleEntity, GrammarRuleDomainError> {
    if (!p.title?.trim()) {
      return Result.fail(GrammarRuleDomainError.EMPTY_TITLE);
    }

    const validVisibilities = getValidVisibilities(!!p.ownerSchoolId);
    if (!validVisibilities.includes(p.visibility)) {
      return Result.fail(GrammarRuleDomainError.INVALID_VISIBILITY_FOR_OWNER_TYPE);
    }

    const now = new Date();
    const entity = new GrammarRuleEntity(id ?? randomUUID(), {
      // Slug assigned after creation by handler if visibility = PUBLIC.
      slug: null,
      targetLanguage: p.targetLanguage,
      difficultyLevel: p.difficultyLevel,
      topic: p.topic,
      subtopic: p.subtopic ?? null,
      title: p.title,
      description: p.description ?? null,
      ownerUserId: p.ownerUserId,
      ownerSchoolId: p.ownerSchoolId ?? null,
      visibility: p.visibility,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    entity.addDomainEvent(
      new GrammarRuleCreatedEvent({
        ruleId: entity.id,
        ownerUserId: p.ownerUserId,
        ownerSchoolId: p.ownerSchoolId ?? null,
        targetLanguage: p.targetLanguage,
        topic: p.topic,
        visibility: p.visibility,
      }),
    );

    return Result.ok(entity);
  }

  static reconstitute(id: string, props: GrammarRuleProps): GrammarRuleEntity {
    return new GrammarRuleEntity(id, props);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  update(changes: UpdateGrammarRuleProps): Result<void, GrammarRuleDomainError> {
    if (this.props.deletedAt !== null) {
      return Result.fail(GrammarRuleDomainError.RULE_ALREADY_DELETED);
    }

    if (changes.title !== undefined && !changes.title.trim()) {
      return Result.fail(GrammarRuleDomainError.EMPTY_TITLE);
    }

    if (changes.visibility !== undefined) {
      const validVisibilities = getValidVisibilities(!!this.props.ownerSchoolId);
      if (!validVisibilities.includes(changes.visibility)) {
        return Result.fail(GrammarRuleDomainError.INVALID_VISIBILITY_FOR_OWNER_TYPE);
      }
    }

    const updatedFields: string[] = [];

    if (changes.title !== undefined && changes.title !== this.props.title) {
      this.props.title = changes.title;
      updatedFields.push('title');
    }
    if ('description' in changes && changes.description !== this.props.description) {
      this.props.description = changes.description ?? null;
      updatedFields.push('description');
    }
    if (
      changes.difficultyLevel !== undefined &&
      changes.difficultyLevel !== this.props.difficultyLevel
    ) {
      this.props.difficultyLevel = changes.difficultyLevel;
      updatedFields.push('difficultyLevel');
    }
    if (changes.topic !== undefined && changes.topic !== this.props.topic) {
      this.props.topic = changes.topic;
      updatedFields.push('topic');
    }
    if ('subtopic' in changes && changes.subtopic !== this.props.subtopic) {
      this.props.subtopic = changes.subtopic ?? null;
      updatedFields.push('subtopic');
    }
    if (changes.visibility !== undefined && changes.visibility !== this.props.visibility) {
      this.props.visibility = changes.visibility;
      updatedFields.push('visibility');
    }

    if (updatedFields.length > 0) {
      this.props.updatedAt = new Date();
      this.addDomainEvent(new GrammarRuleUpdatedEvent({ ruleId: this.id, updatedFields }));
    }

    return Result.ok();
  }

  softDelete(): Result<void, GrammarRuleDomainError> {
    if (this.props.deletedAt !== null) {
      return Result.fail(GrammarRuleDomainError.RULE_ALREADY_DELETED);
    }

    this.props.deletedAt = new Date();
    this.props.updatedAt = new Date();
    this.addDomainEvent(
      new GrammarRuleDeletedEvent({ ruleId: this.id, ownerUserId: this.props.ownerUserId }),
    );
    return Result.ok();
  }

  /**
   * Assigns a slug. Slug is set when visibility = PUBLIC (at creation or
   * on visibility transition). Immutable after first assignment.
   */
  assignSlug(slug: string): Result<void, GrammarRuleDomainError> {
    if (this.props.slug !== null) {
      return Result.fail(GrammarRuleDomainError.SLUG_ALREADY_ASSIGNED);
    }
    this.props.slug = slug;
    this.props.updatedAt = new Date();
    return Result.ok();
  }
}
