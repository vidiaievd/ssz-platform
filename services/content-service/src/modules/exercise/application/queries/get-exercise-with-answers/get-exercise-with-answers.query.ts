/** Used by the owner/admin and exercise engine. Instructions and expected answers are included in the response DTO. */
export class GetExerciseWithAnswersQuery {
  constructor(public readonly exerciseId: string) {}
}
