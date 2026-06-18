export class GetOnboardingSettingsQuery {
  constructor(
    readonly callerId: string,
    readonly schoolId: string,
  ) {}
}
