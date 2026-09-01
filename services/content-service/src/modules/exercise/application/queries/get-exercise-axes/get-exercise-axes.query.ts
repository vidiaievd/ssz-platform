import type { AxesScope } from '../../../../../shared/skills/domain/exercise-axes.port.js';

export class GetExerciseAxesQuery {
  constructor(
    public readonly exerciseId: string,
    /** `live` is what students are being served; `draft` is the unreleased edit. */
    public readonly scope: AxesScope = 'live',
  ) {}
}
