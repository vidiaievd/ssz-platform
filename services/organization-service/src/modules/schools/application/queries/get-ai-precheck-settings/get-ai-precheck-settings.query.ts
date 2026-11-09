/** Whether a school's learners may rehearse with a model — read by its managers and by exercise-engine. */
export class GetAiPrecheckSettingsQuery {
  constructor(public readonly schoolId: string) {}
}
