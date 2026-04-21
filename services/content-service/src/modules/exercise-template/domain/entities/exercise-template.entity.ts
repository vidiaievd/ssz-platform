import { Entity } from '../../../../shared/domain/entity.base.js';

interface ExerciseTemplateProps {
  code: string;
  name: string;
  description: string | null;
  // JSON Schema (draft-07 subset) for exercise.content.
  contentSchema: Record<string, unknown>;
  // JSON Schema (draft-07 subset) for exercise.expected_answers.
  answerSchema: Record<string, unknown>;
  // Merged at read time: exercise.answerCheckSettings overrides these (shallow).
  defaultCheckSettings: Record<string, unknown> | null;
  // null = all target languages are supported.
  supportedLanguages: string[] | null;
  isActive: boolean;
  createdAt: Date;
}

/**
 * ExerciseTemplate is pure seed data — no factory `create()` method.
 * Entities are hydrated from DB via `reconstitute()` only.
 * No mutations, no domain events: templates are read-only at runtime.
 */
export class ExerciseTemplateEntity extends Entity<string> {
  private constructor(
    id: string,
    private readonly props: ExerciseTemplateProps,
  ) {
    super(id);
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  get code(): string {
    return this.props.code;
  }
  get name(): string {
    return this.props.name;
  }
  get description(): string | null {
    return this.props.description;
  }
  get contentSchema(): Record<string, unknown> {
    return this.props.contentSchema;
  }
  get answerSchema(): Record<string, unknown> {
    return this.props.answerSchema;
  }
  get defaultCheckSettings(): Record<string, unknown> | null {
    return this.props.defaultCheckSettings;
  }
  get supportedLanguages(): string[] | null {
    return this.props.supportedLanguages;
  }
  get isActive(): boolean {
    return this.props.isActive;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  static reconstitute(id: string, props: ExerciseTemplateProps): ExerciseTemplateEntity {
    return new ExerciseTemplateEntity(id, props);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Returns true if the given target language is supported by this template.
   * A null supportedLanguages list means all languages are supported.
   */
  isLanguageSupported(targetLanguage: string): boolean {
    if (this.props.supportedLanguages === null) {
      return true;
    }
    return this.props.supportedLanguages.includes(targetLanguage);
  }
}
