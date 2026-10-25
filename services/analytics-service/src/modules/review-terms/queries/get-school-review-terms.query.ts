export class GetSchoolReviewTermsQuery {
  constructor(
    public readonly schoolId: string,
    /** Inclusive, UTC days `YYYY-MM-DD`, on the day the term ran out. */
    public readonly from: string,
    public readonly to: string,
  ) {}
}

export class GetTeacherReviewTermsQuery {
  constructor(
    public readonly schoolId: string,
    public readonly teacherId: string,
    /** Inclusive, UTC days `YYYY-MM-DD`, on the day the term ran out. */
    public readonly from: string,
    public readonly to: string,
  ) {}
}
