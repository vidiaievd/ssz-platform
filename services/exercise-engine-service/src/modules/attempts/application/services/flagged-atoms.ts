import type { Logger } from '@nestjs/common';
import {
  EXERCISE_ENGINE_EVENT_TYPES,
  type ExerciseFeedbackAtomsFlaggedPayload,
  type FlaggedAtomsSource,
} from '@ssz/contracts';
import type { IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import type { Attempt } from '../../domain/entities/attempt.entity.js';

/** An atom a remark named — `AiFeedbackItem.atomRef` and `AiDraftRemark.atomRef` alike. */
export interface NamedAtom {
  atomType: string;
  atomId: string;
}

/**
 * The `exercise.feedback.atoms_flagged` letter for the atoms a check named on this attempt
 * (plan 85, step 4) — or null when it named none, so that nothing is published.
 *
 * Distinct by atom, in the order first named: three remarks on one inverted clause are one
 * rule gone wrong, and how often a rule is signalled is the consumer's to limit (§1 rule 3).
 * Whether an atom is among the exercise's own targets is read off the snapshot the attempt
 * took at its start — the same list `attempt.completed` hands the SRS to rate.
 */
export function atomsFlagged(
  attempt: Attempt,
  source: FlaggedAtomsSource,
  named: ReadonlyArray<NamedAtom | null | undefined>,
  now: Date,
): ExerciseFeedbackAtomsFlaggedPayload | null {
  const targets = new Set(attempt.itemTargets.map((t) => keyOf(t)));
  const seen = new Set<string>();
  const atoms: ExerciseFeedbackAtomsFlaggedPayload['atoms'] = [];
  for (const atom of named) {
    if (!atom || typeof atom.atomId !== 'string' || atom.atomId === '') continue;
    const key = keyOf(atom);
    if (seen.has(key)) continue;
    seen.add(key);
    atoms.push({ atomType: atom.atomType, atomId: atom.atomId, inExerciseTargets: targets.has(key) });
  }
  if (atoms.length === 0) return null;

  return {
    userId: attempt.userId,
    exerciseId: attempt.exerciseId,
    attemptId: attempt.id,
    templateCode: attempt.templateCode,
    source,
    atoms,
    schoolId: attempt.schoolId,
    containerId: attempt.containerId,
    groupId: attempt.groupId,
    occurredAt: now.toISOString(),
  };
}

/**
 * Publishes the letter, if there is one, and never fails its caller: the check's answer or
 * the teacher's verdict is already given, and a lost signal costs one nudge of a due date.
 */
export async function publishAtomsFlagged(
  publisher: IEventPublisher,
  logger: Logger,
  payload: ExerciseFeedbackAtomsFlaggedPayload | null,
): Promise<void> {
  if (payload === null) return;
  try {
    await publisher.publish(EXERCISE_ENGINE_EVENT_TYPES.FEEDBACK_ATOMS_FLAGGED, payload);
  } catch (err) {
    logger.warn(
      `atoms_flagged (${payload.source}) on attempt ${payload.attemptId} not published: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

function keyOf(atom: NamedAtom): string {
  return `${atom.atomType}:${atom.atomId}`;
}
