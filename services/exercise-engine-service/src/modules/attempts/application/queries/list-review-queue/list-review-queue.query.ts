/**
 * The submissions of a set of exercises that are waiting on a person.
 *
 * Scoped to exercises on purpose: an attempt in this service carries no school and no
 * course, so "everything my students handed in" is a question only the caller — which
 * knows the course and has already been authorised against it — can ask. The BFF opens
 * this queue either from the exercise the teacher has open, or from a course whose whole
 * exercise list it has just walked; content-service has decided by then whether they may
 * edit it. Authorising once per course and passing the set down is what keeps the course
 * inbox from being one access check per exercise.
 */
export class ListReviewQueueQuery {
  constructor(
    public readonly exerciseIds: string[],
    public readonly limit: number,
    public readonly offset: number,
  ) {}
}
