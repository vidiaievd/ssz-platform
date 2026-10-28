/** An assistant choice the school could not make — see `AssistantAccess`. */
export class InvalidAssistantAccessException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAssistantAccessException';
  }
}
