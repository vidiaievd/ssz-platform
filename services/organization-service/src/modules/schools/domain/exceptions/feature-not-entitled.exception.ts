/** The school's plan does not carry the feature key a setting needs (plan 80, R7). */
export class FeatureNotEntitledException extends Error {
  constructor(public readonly featureKey: string) {
    super(`This workspace's plan does not include ${featureKey}`);
    this.name = 'FeatureNotEntitledException';
  }
}
