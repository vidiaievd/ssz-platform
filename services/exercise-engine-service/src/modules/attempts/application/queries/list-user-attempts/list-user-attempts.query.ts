import type { AttemptStatus } from '../../../domain/entities/attempt.entity.js';

export class ListUserAttemptsQuery {
  constructor(
    public readonly userId: string,
    public readonly exerciseId: string | undefined,
    public readonly status: AttemptStatus | undefined,
    public readonly limit: number,
    public readonly offset: number,
  ) {}
}
