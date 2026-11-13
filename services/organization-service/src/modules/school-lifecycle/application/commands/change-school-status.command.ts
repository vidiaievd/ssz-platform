import type { LifecycleActor, SchoolTransition } from '../../domain/school-lifecycle.js';

/**
 * Moves a school along its lifecycle (plan 90, phase 5). An admin's move needs a reason and leaves a
 * trail row; the owner's "delete school" and the timer leave none. Answers the new state.
 */
export class ChangeSchoolStatusCommand {
  constructor(
    public readonly schoolId: string,
    public readonly transition: SchoolTransition,
    public readonly actor: LifecycleActor,
    public readonly reason: string | null,
  ) {}
}
