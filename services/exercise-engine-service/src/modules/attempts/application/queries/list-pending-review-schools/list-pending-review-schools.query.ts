/**
 * Which schools have work waiting on a person right now (plan 47.5).
 *
 * No parameters: the digest job asks the whole platform, because that is the question —
 * "who should hear from us at all this hour". Narrowing it to a school would put the
 * caller back in the business of knowing which schools exist.
 */
export class ListPendingReviewSchoolsQuery {}
