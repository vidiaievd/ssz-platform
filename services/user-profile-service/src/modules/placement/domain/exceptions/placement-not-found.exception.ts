export class PlacementNotFoundException extends Error {
  constructor(userId: string, language: string) {
    super(`No platform placement result found for user ${userId} and language ${language}`);
    this.name = 'PlacementNotFoundException';
  }
}
