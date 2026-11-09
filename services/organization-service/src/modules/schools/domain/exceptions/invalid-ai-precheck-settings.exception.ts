/** A rehearsal limit the school could not set — see `AiPrecheckSettings`. */
export class InvalidAiPrecheckSettingsException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAiPrecheckSettingsException';
  }
}
