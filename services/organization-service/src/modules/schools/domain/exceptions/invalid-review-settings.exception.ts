/** A response promise the school could not keep the shape of — see `ReviewSettings`. */
export class InvalidReviewSettingsException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidReviewSettingsException';
  }
}
