import { Injectable } from '@nestjs/common';
import { Result } from '../../../../shared/kernel/result.js';
import { VocabularyDomainError } from '../exceptions/vocabulary-domain.exceptions.js';

type PropType = 'string' | 'enum' | 'boolean' | 'string_array';

interface PropSchema {
  type: PropType;
  values?: string[];
  required?: boolean;
}

interface LanguageSchema {
  [key: string]: PropSchema;
}

/**
 * Validates `grammaticalProperties` JSONB against a per-language schema registry.
 *
 * Registry design:
 * - Languages listed here are validated strictly: only known keys allowed,
 *   each value must match its declared type.
 * - Unknown languages are validated permissively: any object is accepted.
 *   This allows tutors to add content for languages not yet in the registry
 *   without blocking them.
 *
 * To add a new language: add an entry to `this.schemas`.
 */
@Injectable()
export class GrammaticalPropertiesValidatorService {
  private readonly schemas: Record<string, LanguageSchema> = {
    no: {
      // Norwegian
      gender: { type: 'enum', values: ['masculine', 'feminine', 'neuter', 'common'] },
      plural_form: { type: 'string' },
      definite_singular: { type: 'string' },
      definite_plural: { type: 'string' },
      verb_class: {
        type: 'enum',
        values: ['weak_1', 'weak_2', 'strong', 'modal', 'irregular'],
      },
      present_tense: { type: 'string' },
      past_tense: { type: 'string' },
      perfect_tense: { type: 'string' },
    },
    en: {
      // English
      verb_forms: { type: 'string' }, // e.g. "go, went, gone"
      plural: { type: 'string' },
      irregular: { type: 'boolean' },
    },
    ru: {
      // Russian
      gender: { type: 'enum', values: ['masculine', 'feminine', 'neuter'] },
      aspect: { type: 'enum', values: ['perfective', 'imperfective'] },
      declension: { type: 'string' },
    },
  };

  validate(targetLanguage: string, properties: unknown): Result<void, VocabularyDomainError> {
    // null / undefined is valid — the field is optional
    if (properties === null || properties === undefined) {
      return Result.ok();
    }

    if (typeof properties !== 'object' || Array.isArray(properties)) {
      return Result.fail(VocabularyDomainError.INVALID_GRAMMATICAL_PROPERTIES);
    }

    const schema = this.schemas[targetLanguage];

    // Unknown language — permissive: accept any object
    if (!schema) {
      return Result.ok();
    }

    const props = properties as Record<string, unknown>;

    for (const key of Object.keys(props)) {
      if (!(key in schema)) {
        return Result.fail(VocabularyDomainError.INVALID_GRAMMATICAL_PROPERTIES);
      }

      const fieldSchema = schema[key];
      const value = props[key];

      if (!this.matchesType(value, fieldSchema)) {
        return Result.fail(VocabularyDomainError.INVALID_GRAMMATICAL_PROPERTIES);
      }
    }

    return Result.ok();
  }

  private matchesType(value: unknown, schema: PropSchema): boolean {
    switch (schema.type) {
      case 'string':
        return typeof value === 'string';
      case 'boolean':
        return typeof value === 'boolean';
      case 'enum':
        return typeof value === 'string' && (schema.values ?? []).includes(value);
      case 'string_array':
        return Array.isArray(value) && value.every((v) => typeof v === 'string');
      default:
        return false;
    }
  }
}
