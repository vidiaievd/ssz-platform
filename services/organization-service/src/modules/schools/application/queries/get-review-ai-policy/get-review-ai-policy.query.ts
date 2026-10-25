/** Who answers a school's work first — read by its managers and by exercise-engine. */
export class GetReviewAiPolicyQuery {
  constructor(public readonly schoolId: string) {}
}
