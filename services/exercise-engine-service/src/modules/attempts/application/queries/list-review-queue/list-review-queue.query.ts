/**
 * The submissions of one exercise that are waiting on a person.
 *
 * Scoped to an exercise on purpose: an attempt in this service carries no school and no
 * course, so "everything my students handed in" is a question only the caller — which
 * knows the course and has already been authorised against it — can ask. The BFF opens
 * this queue from the exercise the teacher has open, and content-service has decided by
 * then whether they may edit it.
 */
export class ListReviewQueueQuery {
  constructor(
    public readonly exerciseId: string,
    public readonly limit: number,
    public readonly offset: number,
  ) {}
}
