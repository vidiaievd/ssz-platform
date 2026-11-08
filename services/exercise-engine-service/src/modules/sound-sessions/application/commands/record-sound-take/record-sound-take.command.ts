export class RecordSoundTakeCommand {
  constructor(
    public readonly attemptId: string,
    public readonly userId: string,
    /** The learner's take — a `submission_recording` made for this attempt. */
    public readonly recordingAssetId: string,
    /** `takeIndex` of the session view the take was recorded for. */
    public readonly takeIndex: number,
    /** The language the model explains a miss in; English when null. */
    public readonly explanationLanguage: string | null,
  ) {}
}
