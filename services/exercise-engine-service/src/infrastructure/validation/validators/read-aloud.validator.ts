import { Injectable } from '@nestjs/common';
import { fromPersisted, planOf, readSubmission } from '@ssz/shared-kernel/read-aloud';
import type { CarriedRuling, FocusWord, Mode, Prompt, RevisionPolicy } from '@ssz/shared-kernel/read-aloud';
import { Result } from '../../../shared/kernel/result.js';
import { ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';

/** One prompt as the teacher's queue draws it: what was asked, what to listen for, what came back. */
export interface ReadAloudPromptDetails {
  itemId: string;
  label: string;
  /**
   * The material of the exercise's current mode, or null for a prompt the author has since
   * deleted — the recording is still the student's work and is still listed.
   */
  material:
    | { kind: 'read'; text: string }
    | {
        kind: 'monologue';
        image: { assetId: string; caption: string; alt: string } | null;
        plan: Array<{ id: string; text: string; required: boolean }>;
      }
    | { kind: 'dialogue'; situation: string; partner: string }
    | null;
  /** The author's listening note — «Lyttepunkt». */
  note: string;
  /** The words to listen for, highlighted in the text with their notes. `read` only. */
  focus: FocusWord[];
  minSeconds: number | null;
  maxSeconds: number | null;
  recording: {
    assetId: string;
    /** As the client reported it; the server's measurement comes with the playback URL. */
    seconds: number;
    /** How many takes the student made — «N opptak». */
    takes: number;
    /** The takes not chosen, under `keepAllTakes` only. */
    discarded: Array<{ assetId: string; seconds: number }>;
  };
  /**
   * Passed in an earlier try and carried into this one (plan 70, phase 11b): the queue shows
   * it folded and read-only — «passed in attempt N» with the marks and the comment it passed
   * on — and nobody grades it again. Null for a prompt recorded in this try.
   */
  carried: CarriedRuling | null;
}

export interface ReadAloudDetails {
  /** The queue's tally (plan 44 §0.3): a prompt is an item, and the machine passed none. */
  totalItems: number;
  passedItems: 0;
  mode: Mode;
  /**
   * What a failing verdict does to the student, as the exercise reads today: `return` opens a
   * new attempt, `once` closes the work as not passed. The queue's button is named by it
   * («Send tilbake for nytt opptak» / «Fullfør som ikke bestått»); the verdict itself does not
   * read it.
   */
  revision: RevisionPolicy;
  prompts: ReadAloudPromptDetails[];
}

/**
 * Handles `read_aloud` — which, like `writing_task`, means never grading it (plan 70 §3.5).
 *
 * Nothing about a recording is decided by a machine (README idea 3, RA-U11): `requiresReview`
 * is the design, not a fallback, and there is no score to write. What this adds is the queue's
 * view of the work — each prompt's material, the listening note and the focus words from the
 * key, and the take the student chose — recomputed against the exercise as it stands whenever
 * a teacher opens the submission.
 *
 * Whether the recordings exist, belong to the student and are long enough is not decided here:
 * that needs media-service, and this interface is synchronous. The submit handler asks before
 * it gets this far (`read-aloud-recordings.ts`). This validator also runs when a teacher opens
 * the submission, against an exercise that may have changed since — so it lists what was
 * handed in, in the order it was handed in, and never refuses work over the author's edits.
 *
 * Written for the teacher: the note and the focus words are the key. The submit handler
 * forwards details only for templates that declared them learner-facing, and this is not one.
 */
@Injectable()
export class ReadAloudValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    const submission = readSubmission(input.submittedAnswer);
    if (submission === null) {
      return Result.fail(
        new ValidationError(
          'SCHEMA_MISMATCH',
          'A read_aloud answer is { recordings: [{ itemId, assetId, seconds, takes, discarded? }] }',
        ),
      );
    }

    const document = fromPersisted(input.content, input.expectedAnswers);
    const prompts = new Map(document.prompts.map((p) => [p.id, p]));

    const details: ReadAloudDetails = {
      totalItems: submission.recordings.length,
      passedItems: 0,
      mode: document.mode,
      revision: document.settings.revision,
      prompts: submission.recordings.map((r, index): ReadAloudPromptDetails => {
        const prompt = prompts.get(r.itemId);
        return {
          itemId: r.itemId,
          label: prompt?.label.trim() || `Prompt ${index + 1}`,
          material: prompt ? materialOf(prompt, document.mode) : null,
          note: prompt?.note ?? '',
          focus: document.mode === 'read' && prompt ? prompt.focus.map((f) => ({ ...f })) : [],
          minSeconds: prompt?.minSeconds ?? null,
          maxSeconds: prompt?.maxSeconds ?? null,
          recording: {
            assetId: r.assetId,
            seconds: r.seconds,
            takes: r.takes,
            // Kept only when the author asked for every take (DECISIONS §1). A client that sent
            // them anyway has not made them the teacher's business.
            discarded: document.recording.keepAllTakes ? (r.discarded ?? []) : [],
          },
          carried: r.carried ?? null,
        };
      }),
    };

    return Result.ok<ValidationOutcome, ValidationError>({
      correct: false,
      score: 0,
      details,
      requiresReview: true,
    });
  }
}

/** Only the current mode's material — the other modes' fields stay in the document (§3.1). */
function materialOf(prompt: Prompt, mode: Mode): ReadAloudPromptDetails['material'] {
  if (mode === 'read') return { kind: 'read', text: prompt.text };
  if (mode === 'dialogue') {
    return { kind: 'dialogue', situation: prompt.turn.situation, partner: prompt.turn.partner };
  }
  return {
    kind: 'monologue',
    image: prompt.image.assetId.trim() === '' ? null : { ...prompt.image },
    plan: planOf(prompt).map((p) => ({ ...p })),
  };
}
