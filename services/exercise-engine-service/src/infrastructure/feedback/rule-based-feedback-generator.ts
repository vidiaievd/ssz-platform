import { Injectable } from '@nestjs/common';
import type {
  FeedbackInput,
  FeedbackOutput,
  IFeedbackGenerator,
} from '../../shared/application/ports/feedback-generator.port.js';
import { Result } from '../../shared/kernel/result.js';

interface ExerciseInstruction {
  language: string;
  text?: string;
  hint?: string | null;
  overrides?: Record<string, unknown> | null;
}

interface ExerciseDefinitionBundle {
  exercise?: {
    answerCheckSettings?: Record<string, unknown> | null;
  };
  template?: {
    defaultCheckSettings?: Record<string, unknown>;
  };
  instruction?: ExerciseInstruction | null;
  instructions?: ExerciseInstruction[];
}

@Injectable()
export class RuleBasedFeedbackGenerator implements IFeedbackGenerator {
  async generate(input: FeedbackInput): Promise<Result<FeedbackOutput, Error>> {
    const def = input.exerciseDefinition as ExerciseDefinitionBundle | null;

    const checkSettings: Record<string, unknown> = {
      ...(def?.template?.defaultCheckSettings ?? {}),
      ...(def?.exercise?.answerCheckSettings ?? {}),
    };

    if (input.correct) {
      const summary =
        (checkSettings['successMessage'] as string | undefined) ?? 'Correct!';
      return Result.ok({ summary });
    }

    // Locale fallback: requested → English → first available
    const instruction = this.resolveInstruction(def, input.locale);
    const hint = instruction?.hint ?? null;

    const hintTemplate = checkSettings['hintTemplate'] as string | undefined;
    let summary: string;

    if (hintTemplate) {
      summary = this.fillTemplate(hintTemplate, input.validationDetails);
    } else if (hint) {
      summary = hint;
    } else {
      const correctAnswer = this.extractCorrectAnswer(input.templateCode, def);
      summary = correctAnswer
        ? `Incorrect. Expected: ${correctAnswer}`
        : 'Incorrect. Please try again.';
    }

    const hints = hint && !hintTemplate ? undefined : (hint ? [hint] : undefined);
    const correctAnswer = this.extractCorrectAnswer(input.templateCode, def);

    return Result.ok({
      summary,
      hints,
      correctAnswer: correctAnswer ?? undefined,
    });
  }

  private resolveInstruction(
    def: ExerciseDefinitionBundle | null | undefined,
    locale: string,
  ): ExerciseInstruction | null {
    const list: ExerciseInstruction[] =
      def?.instructions ?? (def?.instruction ? [def.instruction] : []);

    return (
      list.find((i) => i.language === locale) ??
      list.find((i) => i.language === 'en') ??
      list[0] ??
      null
    );
  }

  private fillTemplate(template: string, details: unknown): string {
    if (!details || typeof details !== 'object') return template;
    let result = template;
    for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
      result = result.replaceAll(`{{${key}}}`, String(value ?? ''));
    }
    return result;
  }

  private extractCorrectAnswer(
    templateCode: string,
    def: ExerciseDefinitionBundle | null | undefined,
  ): string | null {
    const expected = (def as any)?.exercise?.expectedAnswers;
    if (!expected) return null;

    switch (templateCode) {
      case 'multiple_choice': {
        const ids: string[] = expected.correct_option_ids ?? [];
        return ids.length > 0 ? ids.join(', ') : null;
      }
      case 'fill_in_blank': {
        const blanks: Array<{ accepted_answers: string[] }> = expected.blanks ?? [];
        const answers = blanks.map((b) => b.accepted_answers[0] ?? '').filter(Boolean);
        return answers.length > 0 ? answers.join(' / ') : null;
      }
      case 'match_pairs': {
        const pairs: Array<{ left_id: string; right_id: string }> = expected.pairs ?? [];
        return pairs.map((p) => `${p.left_id} → ${p.right_id}`).join(', ') || null;
      }
      default:
        return null;
    }
  }
}
