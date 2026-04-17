import { randomUUID } from 'crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import {
  DifficultyLevel,
  compareLevels,
} from '../../../container/domain/value-objects/difficulty-level.vo.js';
import { VariantStatus } from '../../../lesson/domain/value-objects/variant-status.vo.js';
import { GrammarRuleDomainError } from '../exceptions/grammar-rule-domain.exceptions.js';

interface GrammarRuleExplanationProps {
  grammarRuleId: string;
  explanationLanguage: string;
  minLevel: DifficultyLevel;
  maxLevel: DifficultyLevel;
  displayTitle: string;
  displaySummary: string | null;
  bodyMarkdown: string;
  estimatedReadingMinutes: number | null;
  status: VariantStatus;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string;
  lastEditedByUserId: string;
  publishedAt: Date | null;
  deletedAt: Date | null;
}

export interface CreateExplanationProps {
  grammarRuleId: string;
  explanationLanguage: string;
  minLevel: DifficultyLevel;
  maxLevel: DifficultyLevel;
  displayTitle: string;
  displaySummary?: string;
  bodyMarkdown: string;
  estimatedReadingMinutes?: number;
  createdByUserId: string;
}

export interface UpdateExplanationProps {
  displayTitle?: string;
  displaySummary?: string | null;
  bodyMarkdown?: string;
  estimatedReadingMinutes?: number | null;
}

export class GrammarRuleExplanationEntity extends Entity<string> {
  private constructor(
    id: string,
    private props: GrammarRuleExplanationProps,
  ) {
    super(id);
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  get grammarRuleId(): string {
    return this.props.grammarRuleId;
  }
  get explanationLanguage(): string {
    return this.props.explanationLanguage;
  }
  get minLevel(): DifficultyLevel {
    return this.props.minLevel;
  }
  get maxLevel(): DifficultyLevel {
    return this.props.maxLevel;
  }
  get displayTitle(): string {
    return this.props.displayTitle;
  }
  get displaySummary(): string | null {
    return this.props.displaySummary;
  }
  get bodyMarkdown(): string {
    return this.props.bodyMarkdown;
  }
  get estimatedReadingMinutes(): number | null {
    return this.props.estimatedReadingMinutes;
  }
  get status(): VariantStatus {
    return this.props.status;
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
  get publishedAt(): Date | null {
    return this.props.publishedAt;
  }
  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  static create(
    p: CreateExplanationProps,
    id?: string,
  ): Result<GrammarRuleExplanationEntity, GrammarRuleDomainError> {
    if (compareLevels(p.minLevel, p.maxLevel) > 0) {
      return Result.fail(GrammarRuleDomainError.INVALID_LEVEL_RANGE);
    }

    if (!p.bodyMarkdown?.trim()) {
      return Result.fail(GrammarRuleDomainError.EMPTY_BODY_MARKDOWN);
    }

    const now = new Date();
    return Result.ok(
      new GrammarRuleExplanationEntity(id ?? randomUUID(), {
        grammarRuleId: p.grammarRuleId,
        explanationLanguage: p.explanationLanguage,
        minLevel: p.minLevel,
        maxLevel: p.maxLevel,
        displayTitle: p.displayTitle,
        displaySummary: p.displaySummary ?? null,
        bodyMarkdown: p.bodyMarkdown,
        estimatedReadingMinutes: p.estimatedReadingMinutes ?? null,
        status: VariantStatus.DRAFT,
        createdAt: now,
        updatedAt: now,
        createdByUserId: p.createdByUserId,
        lastEditedByUserId: p.createdByUserId,
        publishedAt: null,
        deletedAt: null,
      }),
    );
  }

  static reconstitute(
    id: string,
    props: GrammarRuleExplanationProps,
  ): GrammarRuleExplanationEntity {
    return new GrammarRuleExplanationEntity(id, props);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  /**
   * Silent updates allowed even on PUBLISHED explanations (typo fixes etc.).
   * Immutable fields: grammarRuleId, explanationLanguage, minLevel, maxLevel, createdByUserId.
   */
  update(
    changes: UpdateExplanationProps,
    editorUserId: string,
  ): Result<void, GrammarRuleDomainError> {
    if (changes.bodyMarkdown !== undefined && !changes.bodyMarkdown.trim()) {
      return Result.fail(GrammarRuleDomainError.EMPTY_BODY_MARKDOWN);
    }

    if (changes.displayTitle !== undefined) {
      this.props.displayTitle = changes.displayTitle;
    }
    if ('displaySummary' in changes) {
      this.props.displaySummary = changes.displaySummary ?? null;
    }
    if (changes.bodyMarkdown !== undefined) {
      this.props.bodyMarkdown = changes.bodyMarkdown;
    }
    if ('estimatedReadingMinutes' in changes) {
      this.props.estimatedReadingMinutes = changes.estimatedReadingMinutes ?? null;
    }

    this.props.lastEditedByUserId = editorUserId;
    this.props.updatedAt = new Date();
    return Result.ok();
  }

  /**
   * Transitions DRAFT → PUBLISHED.
   * Returns EXPLANATION_ALREADY_PUBLISHED if already published.
   */
  publish(): Result<void, GrammarRuleDomainError> {
    if (this.props.status === VariantStatus.PUBLISHED) {
      return Result.fail(GrammarRuleDomainError.EXPLANATION_ALREADY_PUBLISHED);
    }

    this.props.status = VariantStatus.PUBLISHED;
    this.props.publishedAt = new Date();
    this.props.updatedAt = new Date();
    return Result.ok();
  }
}
