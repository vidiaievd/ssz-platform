/**
 * Sets or clears this course's own response promise.
 *
 * `null` means "inherit the school's" — a value, not an omission (plan 44 §44.12,
 * criterion 35).
 */
export class SetContainerReviewSettingsCommand {
  constructor(
    public readonly userId: string,
    public readonly containerId: string,
    public readonly respondWithinHours: number | null,
  ) {}
}
