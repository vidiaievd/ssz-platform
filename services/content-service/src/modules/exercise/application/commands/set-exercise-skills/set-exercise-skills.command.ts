import type { Focus, Skill } from '@ssz/shared-kernel/skills';

/**
 * The author's word on what an exercise trains — or its withdrawal.
 *
 * `axes: null` withdraws the override and hands the exercise back to the derivation.
 * That is a different statement from `{ skills: [], focus: [] }`, which says the exercise
 * is a warm-up that should count towards nothing; both are expressible, and the marker
 * column is what keeps them apart (plan 55 §3.5).
 */
export class SetExerciseSkillsCommand {
  constructor(
    public readonly userId: string,
    public readonly exerciseId: string,
    public readonly axes: { skills: Skill[]; focus: Focus[] } | null,
  ) {}
}
