import type { Focus, Modality, Skill } from '@ssz/contracts';
import type {
  AttemptItemTarget,
  DifficultyLevel,
} from '../../../../attempts/domain/entities/attempt.entity.js';
import type { ProbeDefinition, ProbeSource } from '../../../domain/entities/probe-task.entity.js';

/**
 * Make one disposable task for one learner (plan 63 phase 9).
 *
 * The command takes the task *already written*. Nothing here writes Norwegian: the
 * generator that will — an LLM loop, out of scope for this phase — is a caller, and so is
 * a teacher assembling one by hand before tomorrow's lesson. This is the place they
 * connect to, and keeping the writing out of it is what lets both exist.
 *
 * What the engine insists on is the part it will be held to later: a subject atom, a
 * modality, and a template it can actually score.
 */
export class CreateProbeCommand {
  constructor(
    /** The learner the probe is dealt to. Nobody else can open it. */
    public readonly userId: string,
    public readonly subject: { atomType: string; atomId: string },
    public readonly requiredModality: Modality,
    public readonly definition: ProbeDefinition,
    public readonly skills: Skill[],
    public readonly focus: Focus[],
    public readonly targets: AttemptItemTarget[] | null,
    /** Null falls back to the configured default; anything over the ceiling is clamped. */
    public readonly ttlSeconds: number | null,
    public readonly source: ProbeSource,
    /** The person who asked for it, where a person did. Null for the generator. */
    public readonly createdByUserId: string | null,
  ) {}
}

export type { DifficultyLevel };
