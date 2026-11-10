/** A school's student seats, read by the people who run the school (plan 90, phase 4, step 4). */
export class GetSchoolSeatsQuery {
  constructor(
    public readonly schoolId: string,
    public readonly actorId: string,
  ) {}
}
