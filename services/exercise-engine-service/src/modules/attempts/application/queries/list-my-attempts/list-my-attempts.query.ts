import type { AttemptStatus } from '../../../domain/entities/attempt.entity.js';

export class ListMyAttemptsQuery {
  constructor(
    public readonly userId: string,
    public readonly exerciseId: string | undefined,
    public readonly status: AttemptStatus | undefined,
    public readonly limit: number,
    public readonly cursor: string | undefined,
  ) {}
}
