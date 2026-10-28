/** Which students a school's assistant answers on the school's account — read by its managers. */
export class GetAssistantAccessQuery {
  constructor(
    public readonly schoolId: string,
    public readonly actorId: string,
  ) {}
}
