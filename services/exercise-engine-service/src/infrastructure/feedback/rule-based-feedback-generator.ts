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
    const correctAnswer = input.revealAnswer
      ? this.extractCorrectAnswer(input.templateCode, def)
      : null;
    let summary: string;

    if (hintTemplate) {
      summary = this.fillTemplate(hintTemplate, input.validationDetails);
    } else if (hint) {
      summary = hint;
    } else {
      summary = correctAnswer
        ? `Incorrect. Expected: ${correctAnswer}`
        : 'Incorrect. Please try again.';
    }

    const hints = hint && !hintTemplate ? undefined : (hint ? [hint] : undefined);

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
      // `match_pairs` was here, reading `expected.pairs` as `{left_id, right_id}` and
      // joining the ids into "l1 → r1, l2 → r2" — a string no learner could read. That
      // key no longer exists (plan 49 moved the pairing into `content.pairs`), and the
      // template is deliberately not given a replacement case: it withholds its answers,
      // so handing them back in a summary on the first wrong submit would undo the point
      // of the reveal being a separate, recorded action. Its explanations arrive per
      // slot in the verdict instead. `word_bank_gap_fill` is absent for the same reason
      // and has always been.
      default:
        return null;
    }
  }
}
